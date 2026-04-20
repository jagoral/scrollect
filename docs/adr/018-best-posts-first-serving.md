---
status: proposed
date: 2026-04-19
---

# ADR-018: Best-posts-first serving after quality-first generation

## Context

Issue #216. ADR-017 (PR #217, #215) made initial draft generation lazy, bounded, and section-ranker driven. The remaining problem is at serving time: the first feed after upload still clusters in the first 2% of the book and is dominated by quote posts. Production DDIA evidence: first 12 served posts in positions 0-2%, quote share 41.7% vs pool 24.3%, `qualityScore` median 1.000 and 97.9% of drafts in `[0.85, 1.0]`. The current serving scorer in `src/feed/logic/scoring.ts` (ADR-016) uses `qualityScore` as its sole quality signal, ignores the user's learning goal, and has no book-depth constraint. This ADR changes the inputs to that scorer and adds new diversity passes. It does not re-litigate ADR-016's scoring architecture, generation cadence (#215), or section allocation — those remain the baseline.

## Decision

### 1. `semanticQualityScore` on `postDrafts`

Add `semanticQualityScore: v.optional(v.number())` to the `postDrafts` table. The score is 0-1, produced at generation time by extending the existing `PostDraftValidator` call (already a per-draft LLM call — no new calls added). The validator returns both its existing boolean verdict and a semantic-quality judgement against a rubric: does the post teach a concrete concept, mechanism, tradeoff, example, failure mode, or decision rule; is it specific and self-contained; is it memorable and worth the learner's attention right now? The rubric is language-agnostic — no English-only keywords.

Explicit quote-specific anchor in the rubric: a quote that is verbatim and well-formed but does not teach a concept, decision principle, or mechanism scores ≤ 0.6. This is how quote posts — which historically hit structural `qualityScore = 1.000` — can now land below 0.7. Front matter, dedications, acknowledgements, part dividers, generic chapter setup, trivial quiz facts, and vague summaries also score low under the same rubric without needing any title-phrase heuristic.

**Fallback:** if `semanticQualityScore` is missing (pre-ADR drafts, validator failure, validator disabled) the serving scorer reads `qualityScore` in its place. No crash path.

### 2. Persist section-level quality signal on drafts

Copy the `qualitySignal` produced by `SectionDraftRankerLlm` (#215) onto each generated draft as `sectionQualitySignal: v.optional(v.number())`. Avoids a join from draft to `sectionSummaries` at serve time. Stored once at draft write; read as a tie-breaker at serve time. Optional for backward compat.

### 3. Learning-goal relevance at serving time

**Persistence:** add `learningGoalEmbedding: v.optional(v.array(v.float64()))` to `documents`. The vector is colocated with the `learningGoal` text on the same document row so editing or clearing a goal on one document cannot trample another document's vector. Recomputed by the `updateLearningGoal` mutation whenever the text changes; cleared by `clearLearningGoal` / `skipLearningGoalOnboarding`. No new index — the serving mutation already loads the document row per call.

**Why per-document, not per-user.** An earlier draft of this ADR kept the embedding on `userProfiles` with a "most recent goal wins" reconciliation rule. That was a correctness bug: a document whose text says "learn X" could end up scored against another document's embedding because the most recent goal belonged to a different doc. Colocating with the text eliminates that class of bug entirely and lines up with the future-topic seam (topic-level embedding resolves first, then falls back to per-document, then undefined).

**Draft-side vector:** reuse the existing section-summary embedding (`sectionSummaries.embeddingId` in the summary store). Already multilingual because the embedding model is language-agnostic. At serve time, the scorer fetches section vectors only for the top-K candidate drafts (bounded by `batchSize * 3`), not the whole pool.

**Formula:**

```
goalRelevance = 1 + α * max(0, cosine(goalVec, sectionVec) - 0.1)
```

with `α = 0.6` and a floor at `cosine - 0.1` so weakly-related sections don't inflate the score. The `α` is conservative — the goal refines ranking rather than dominating.

**Missing-goal path:** when `learningGoalEmbedding` is absent, the user never completed onboarding, the section has no embedding, or the vector store call fails, `goalRelevance = 1.0`. Safe degradation, no error propagation.

**Goal edit:** the `updateLearningGoal` mutation on a document writes `learningGoal` and schedules the embed action. On any text change — not just first-set — the embedding is recomputed. Clearing or skipping the goal patches both fields back to `undefined` on that document only; no cross-document reconciliation.

**Future-ready resolver seam.** The product roadmap includes grouping documents into user-owned topics (potentially one level of nesting, Obsidian/Reddit style) where each topic carries its own learning goal — e.g. a document placed in a "Testing" topic should be ranked against that topic's goal even if the book covers wider ground. The scorer must not read `documents.learningGoalEmbedding` directly. Instead, the serving mutation calls a single resolver `getEffectiveLearningGoalEmbedding(ctx, documentId)` that today returns the document's vector verbatim. When topics ship, that resolver is the only place that changes — it will look up `document.topicId` (future field), walk to the topic's own goal embedding, and fall back to the document's own embedding when the document is not in any topic. No schema table is added for topics today (YAGNI), but the read path for goal embeddings is routed through this seam so the serving layer is topic-agnostic now and topic-aware later without a scoring-code diff.

### 4. Extended scoring formula

Extends ADR-016 multiplicatively. All new terms default to 1.0 when inputs are missing.

```
score = effectiveQuality
      * recencyBoost
      * highlightMultiplier
      * saturationPenalty
      * reactionMultiplier
      * goalRelevance
      * frontMatterPenalty
```

- `effectiveQuality = semanticQualityScore ?? qualityScore` when only post-level data is present. When both post and section signals exist: `effectiveQuality = 0.7 * semanticQualityScore + 0.3 * sectionQualitySignal`. Post-level dominates; section-level breaks ties and down-ranks drafts whose section was rated low by the ranker.
- `frontMatterPenalty = 0.2` if `sectionQualitySignal < 0.3`, else `1.0`. Language-agnostic because `sectionQualitySignal` itself is language-agnostic (#215 ranker is multilingual).
- `recencyBoost`, `highlightMultiplier`, `saturationPenalty`, `reactionMultiplier`: unchanged from ADR-016.

### 5. Book-position diversity pass

New reorder pass, added to `scoreDrafts` after the score sort and before the existing type/section/document diversity passes. Each `ScoredDraft` gains `bookPosition = section.chunkStartIndex / document.chunkCount` (0-1). The pass buckets the scored list into four book-depth quartiles, then round-robin picks the highest-scored remaining post from each non-empty quartile until the batch target is reached. Demoted posts go to the tail, same pattern as existing diversity passes.

Graceful degradation: documents with fewer than 4 substantive sections collapse to a single bucket (pass is a no-op). The cap respects the existing batch size from `ScoringConfig`.

### 6. Post-type share caps at serve time

Extend `ScoringConfig`:

```ts
maxQuoteShare: number; // 0.30
maxQuizShare: number; // 0.30
```

Implemented as demote-to-tail passes (same shape as `applyDocumentDiversity`). Serves as a serve-time guardrail even though #215 already constrains quote generation — belt-and-suspenders given the DDIA evidence.

### 7. Analytics events from the serving mutation

Emitted via the existing `WideEvent` helper in `convex/feed/servingAnalytics.ts`:

- `feed.first_session_book_depth_reach` — max and quartile spread of `bookPosition` in the first 10 served posts per document.
- `feed.first_session_post_type_mix` — type distribution in the first 10 served posts.
- `feed.serving_quality_score_distribution` — histogram buckets of `effectiveQuality` across the batch.
- `feed.learning_goal_relevance_applied` — whether a goal embedding was present and the mean `goalRelevance - 1` applied.

"First session" = served batches where the document's `createdAt` is within 24h AND the document had cumulative `servedCount == 0` before this batch.

### Alternatives considered

- **Separate LLM judge pass after generation** — Doubles LLM cost for zero quality gain vs. extending the existing validator prompt. The validator already reads content and `typeData`.
- **Store per-post embedding and compare directly to goal** — Adds an embedding call per draft (~150 extra embed calls per document). Section-level embedding is already produced by #215 and is granular enough for goal relevance.
- **English keyword list for front-matter filtering** — Explicitly forbidden by #216. Breaks non-English uploads. `sectionQualitySignal` + semantic judge cover the same cases language-agnostically.
- **Rerank top candidates via LLM call at serve time** — Exceeds the <500ms serve budget (ADR-016). Also introduces a language-assumption risk in the rerank prompt.
- **Materialize scores in a `feedQueue` table** — Same argument as ADR-016: breaks on weight changes, adds sync surface, buys nothing at personal scale.
- **Backfill existing drafts** — Out of scope per #216. Would require re-running the validator over thousands of drafts. Fallback path (`semanticQualityScore ?? qualityScore`) means existing drafts keep working.
- **Pass book-position into the score directly as a weight** — Couples diversity with quality. A score-adjacent reorder pass is easier to reason about and test independently, matching the existing type/section/document diversity pattern.

## Consequences

- **Quality signal distribution unlocks.** Because the judge reads content semantics rather than structure, quote posts can score 0.3-0.6, vague summaries 0.2-0.5, and part-divider summaries <0.3. Meets AC std ≥ 0.15 and ≥ 20% below 0.7 on new documents. Old drafts continue to use `qualityScore` and the AC applies only to new-document serving.
- **Backward compatibility preserved.** Every new field is optional; every new multiplier defaults to 1.0; every new cap is permissive when inputs are absent. Existing drafts and users without a learning goal keep working unchanged.
- **New-document-only rollout.** `semanticQualityScore` and `sectionQualitySignal` populate at generation time only. No migration, no backfill. Documents uploaded before this ADR keep their `qualityScore`-based ranking; documents uploaded after use the full formula. Switchover is automatic per-document.
- **Multilingual by construction.** The semantic judge rubric, the section ranker (#215), the goal embedding, and all penalty terms are language-agnostic. No title-phrase matching anywhere.
- **Serving cost.** One vector fetch for the user goal (cached within the mutation) plus up to `batchSize * 3` section-vector fetches for the top candidates. Within ADR-016's <500ms budget.
- **Test and eval surface.** `scoreDrafts` stays pure — a new optional `goalEmbedding` plus `sectionEmbeddings` map parameter is sufficient. Goal-vs-no-goal A/B harness drops out for free: call the function twice with and without the goal vector and diff the order. Semantic-judge prompt drift requires eval coverage (QA task).
- **Risk: validator LLM drift.** The semantic-quality rubric is prompt-driven, so rubric changes could shift the distribution. Mitigated by evals and by keeping the score optional with a structural fallback.
- **Diversity may force lower-scoring posts into the batch.** Book-position and type-share passes can promote a lower-scored post over a higher-scored one. This is intentional — the first-session AC is about spread, not about serving only the top N by score. Consequences are bounded by the existing batch size.

## More Information

- ADR-013 defines `postDrafts` schema and generation pipeline.
- ADR-015 defines highlight-triggered draft generation and `strategy: "highlight"`.
- ADR-016 defines the serving scorer, diversity pass architecture, and `ScoringConfig`. This ADR extends #4 (formula) and adds new passes without replacing it.
- Issue #215 / PR #217 is the generation baseline: bounded pool, section-ranked draft planning, quote-share cap at generation time.
- Issue #216 locks the acceptance criteria this ADR is designed against.
