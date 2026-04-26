---
status: proposed
date: 2026-04-25
---

# ADR-019: Topics - goal-scoped grouping of documents with scoped feed view

## Context

Issue #221, part of epic #219. Users upload documents that span unrelated areas (interview prep next to cooking next to language learning) into a single global pool. The feed today is single-pool: every Post Draft from every Document competes against every other, and the learning-goal seam introduced in ADR-018 §3 resolves to the per-Document goal only. There is no way to focus a session on one area; the unrelated documents dilute the learning signal. ADR-018 explicitly anticipated this case and reserved `getEffectiveLearningGoalEmbedding` (`packages/backend/convex/feed/learningGoal.ts`) as the single seam where topic-aware resolution would land. This ADR is that landing.

## Decision

### 1. New `topics` table

Add a `topics` table owned per-user. Fields:

```
userId, name, learningGoal,
learningGoalEmbedding?, description?, color?, icon?,
parentTopicId?, createdAt
```

Indexes: `by_userId`, `by_userId_name`. `parentTopicId` is reserved for future one-level subtopic nesting (Obsidian/Reddit style); v1 ships no UI for it but the column exists so a future ADR does not need a backfill. `color` and `icon` are optional UI affordances and do not affect scoring.

### 2. New `documentTopics` junction table

Add `documentTopics` with `documentId`, `topicId`, `userId`, `createdAt`. Indexes: `by_documentId`, `by_topicId`, `by_userId`. Schema is N:N. V1 UI is single-select per document (the `assignDocumentToTopic` mutation replaces in place), but the schema does not assume that constraint - a future multi-select UI does not require a migration. Uniqueness on `(documentId, topicId)` is enforced at the mutation layer, not in the schema.

### 3. Resolver precedence: topic -> document -> undefined

`getEffectiveLearningGoalEmbedding(ctx, documentId)` resolves in order:

1. Look up `documentTopics` for `documentId`. If a topic is found and `topics.learningGoalEmbedding` is present, return it.
2. Otherwise return `documents.learningGoalEmbedding` for that document.
3. Otherwise return `undefined` (scorer treats as `goalRelevance = 1.0`).

This diverges from issue #221's literal text. The issue specifies that step 2 should fall back to `userProfiles.learningGoalEmbedding` and that `documents.learningGoal` should no longer be consulted by the resolver. ADR-018 §3 explicitly rejected the `userProfiles` fallback as a correctness bug: a Document whose own goal text says "learn X" could end up scored against another Document's embedding because the most recent profile-level goal belonged to a different doc. Per-Document colocation eliminates that class of bug. We honor ADR-018's rationale here. The user has confirmed this resolution. ADR-019 supersedes the resolver-fallback wording in #221.

The scorer in `src/feed/logic/scoring.ts` is untouched - it consumes whatever vector the resolver returns. All existing feed unit tests and `feedServing.eval.ts` continue to pass.

### 4. Re-rank, do not re-generate

When a Document is assigned to a Topic, its existing Post Drafts were generated under whatever goal was active at draft time (per-Document goal, or none). Those drafts are not regenerated. Serving simply re-ranks the existing pool against the Topic's goal vector. For narrow Topics this means "best subset of a general pool" rather than "topic-tailored generation."

This is an accepted v1 limitation. The cost of regeneration on assignment (re-running `SectionDraftRankerLlm` plus per-section validator calls per Document, multiplied by every Topic membership change) is not justified at personal scale. A future ADR may introduce topic-aware draft generation if user evidence shows the re-rank-only path produces visibly off-topic feeds for narrow Topics.

### 5. Topic-scoped serving query

Add `serveTopicFeed({ topicId, limit })` mirroring the existing `serveDocumentFeed` pattern (PR #232 / issue #220). It resolves member documentIds via `documentTopics.by_topicId` and reuses the shared `serveFeedForScope` internal that `serveDocumentFeed` already calls. We do not overload `serveFeed` with an optional `scope` parameter - the three callers (global, per-document, per-topic) have meaningfully different argument shapes and analytics payloads, and a discriminated query name is easier to grep, easier to authorize, and easier to instrument.

### 6. Topic deletion cascade

`deleteTopic` cascades only the `documentTopics` rows for that Topic. The Documents themselves survive and revert to per-Document goal resolution on the next serve. Contrast with Document deletion, which already cascades a long chain (vectors, chunks, section summaries, post drafts, posts, bookmarks, highlights, connection pairs); Document deletion now also cascades any `documentTopics` rows pointing at the Document.

Account deletion (`deleteRemainingUserData` in `convex/access/account.ts`) cascades both `topics` and `documentTopics` rows owned by the user, alongside the existing per-document cascade chain triggered by `deleteAccountDocuments`. This guarantees no orphaned topic state survives account deletion. The per-document cascade (`cascadeDeleteByDocumentId` in `convex/topics/topics.ts`) handles `documentTopics` rows tied to deleted documents; `deleteRemainingUserData` then sweeps any remaining user-owned topic state (the `topics` rows themselves, plus any `documentTopics` rows whose documents survived per-document cleanup but are user-scoped).

### 7. Goal-text edit triggers re-embedding

Editing `topics.learningGoal` schedules `embedTopicGoal` (new action in `convex/topicsActions.ts`), which writes `topics.learningGoalEmbedding`. This mirrors the `updateLearningGoal` -> `embedLearningGoal` pattern in `convex/content/documents.ts` and `convex/content/documentActions.ts`. Any text change recomputes; clearing the goal text clears the embedding. No cross-Topic reconciliation - each Topic's vector is colocated with its own text.

### Alternatives considered

- **`userProfiles` fallback per issue #221** - Rejected. ADR-018 §3 already documented this as a correctness bug: a Document's content can be scored against an unrelated profile-level goal whenever the most recent profile edit belonged to a different Document area. The per-Document fallback is correct by construction.
- **Multi-topic-per-document UI in v1** - Deferred. Schema is already N:N so no migration is needed when a multi-select UI ships. V1 stays single-select to keep the picker simple and to avoid the "which Topic's goal wins?" resolver question (current resolver picks the first match; a future ADR will define the policy).
- **Card regeneration on assignment** - Deferred. See §4. The LLM cost and the scheduling complexity (debouncing assignment churn, handling partial regeneration) are not justified without evidence that re-ranking is insufficient.
- **Subtopic nesting** - Deferred. Schema reserves `parentTopicId`. A future ADR will define resolver behavior for nested Topics (parent goal vs leaf goal, walk order).
- **Overload `serveFeed` with optional `topicId`/`documentId` scope params** - Rejected. Three discriminated queries (`serveFeed`, `serveDocumentFeed`, `serveTopicFeed`) match the three call sites in the UI and keep authorization, analytics, and validator surface clean. Already established by PR #232.
- **Materialize Topic membership as `documents.topicId` (1:1)** - Rejected. The schema cost of N:N is one extra index; the cost of re-migrating later when multi-Topic ships is much higher. YAGNI does not apply when the cheaper option preserves future optionality at near-zero present cost.

## Consequences

- **Topic-aware ranking with no scoring code change.** ADR-018's resolver seam was designed for exactly this; only `getEffectiveLearningGoalEmbedding` changes. `src/feed/logic/scoring.ts` is byte-for-byte untouched.
- **Existing drafts keep working.** No backfill, no migration. Documents not in a Topic resolve to their per-Document goal; Documents in a Topic with no embedding yet resolve to their per-Document goal as a safe degrade.
- **Narrow Topics may serve generally-drafted Posts.** Until topic-aware generation lands, a Topic with one Document and a tight goal will rank that Document's existing pool against the new vector but cannot conjure new content. Documented as a known v1 limitation per #221.
- **One new write surface on Document delete.** Document deletion now cascades `documentTopics` in addition to its existing chain. Deleting a Topic does not touch Documents.
- **Schema indexes match access patterns.** `documentTopics.by_documentId` powers the resolver hot path; `documentTopics.by_topicId` powers `serveTopicFeed`; `topics.by_userId_name` powers the picker.
- **No public/shared Topics, no analytics dashboards, no subtopic UI.** Explicit non-goals per #221.
- **Risk: silent drift between Topic goal text and embedding.** The embedding action is async; a serve immediately after an edit can read a stale vector. Same risk pattern as Document goals; mitigated by the safe `undefined` -> `1.0` fallback.

## More Information

- ADR-018 §3 introduced `getEffectiveLearningGoalEmbedding` and named the topic-aware future this ADR fulfills.
- Issue #221 specifies the schema and routing; this ADR overrides its resolver-fallback step (see §3).
- Epic #219 is the parent epic for goal-scoped grouping work.
- Resolver implementation: `packages/backend/convex/feed/learningGoal.ts`.
- Pattern reference for goal embedding actions: `packages/backend/convex/content/documents.ts` and `packages/backend/convex/content/documentActions.ts`.
- Pattern reference for scoped serving: `serveDocumentFeed` (PR #232 / issue #220).
