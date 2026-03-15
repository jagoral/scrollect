---
status: proposed
date: 2026-03-12
---

# ADR-006: Tagging system

## Context

Users upload diverse content — books, articles, YouTube videos, PDFs — but have no way to organize or connect them by topic. The feed generator also lacks topic awareness: it can't filter by subject, and cross-document connections are purely coincidental rather than topic-driven.

Issue #43 proposes a tagging system where:

- AI auto-suggests 3–5 tags after document processing completes
- Users can manually add/remove tags
- Tags propagate to posts for feed filtering
- The library supports tag-based filtering

The core architectural question is **how to model tags in Convex** — a database with no JOINs, no subqueries, and where every query must use a single index. This shapes every downstream decision.

## Decision

### 1. Embedded `tagIds` array on documents — no junction table

Store `tagIds: v.array(v.id("tags"))` directly on the `documents` table instead of a `documentTags` junction table.

The issue proposes a junction table, which is the relational instinct, but it's the wrong trade-off for Convex given Scrollect's access patterns:

| Operation               | Junction table cost                                              | Embedded array cost                                                        |
| ----------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Get tags for a document | Query `documentTags.by_documentId` → N rows → N `db.get("tags")` | Read document → `tagIds` → batch `db.get("tags")`                          |
| Get documents for a tag | Query `documentTags.by_tagId` → N rows → N `db.get("documents")` | Query `documents.by_userId` → filter in memory by `tagIds.includes(tagId)` |
| Add a tag to a document | Insert into `documentTags` + integrity check                     | `db.patch` the document's `tagIds` array                                   |
| Remove a tag            | Find + delete junction row                                       | `db.patch` to filter out the ID                                            |

The junction table wins on "get all documents for tag X" (index scan vs full user scan + filter). But in Scrollect's access patterns:

- **"Show tags for this document"** is the hot path — called on every document card render in the library. Embedded array: 1 read + N `db.get`. Junction: 1 index query + N `db.get`. Comparable cost, but embedded avoids the junction row overhead.
- **"Filter library by tag"** is the second hottest path. With embedded arrays, this scans all user documents and filters in memory. Users have 10–100 documents (not 10,000), so a full scan with in-memory filtering completes in single-digit milliseconds.

For tag source tracking (AI vs manual), a parallel `tagSources` array is positionally aligned with `tagIds` — `tagSources[i]` is the source of `tagIds[i]`. All tag mutations go through canonical `addTagToDocument` / `removeTagFromDocument` functions that maintain both arrays atomically. No other code path should modify these fields directly.

Both fields are `v.optional` to avoid migrating existing documents — they start as `undefined` until the AI auto-suggest runs or the user adds tags manually.

### 2. Tag table with normalization

A `tags` table stores per-user tags with:

- `name` — Display name preserving the user's original casing ("React", "GraphQL", "iOS")
- `normalizedName` — Lowercase, trimmed, whitespace-collapsed form for dedup
- `userId` — Tags are scoped to individual users
- `createdAt`

Indexed by `by_userId` (list all tags for autocomplete) and `by_userId_normalizedName` (O(1) dedup check during creation).

**Normalization rules (MVP):** trim whitespace, collapse internal whitespace to single space, lowercase. This means "Machine Learning", "machine learning", and " machine learning " all resolve to the same tag. But "ML" and "machine-learning" remain separate — synonym resolution would require a curated dictionary or AI-powered dedup, both adding complexity for marginal gain at MVP scale.

**Tag creation flow:** Normalize the input → query `by_userId_normalizedName` → if exists, return existing tag ID → if not, insert new tag with both `name` and `normalizedName`.

**Per-user tags, not global:** Consistent with Scrollect's "personal, not social" principle. Global tags would require cross-user dedup, moderation, and create privacy leakage vectors (seeing that someone tagged a document reveals they have it).

### 3. AI auto-suggest and runtime tag propagation

**Auto-suggest** runs after `checkCompletion()` in `pipeline/embedding.ts` marks a document as "ready". This is the right hook point because all chunks are embedded and available for sampling, the document is visible in the library, and tag suggestion is non-blocking — it doesn't gate readiness.

The `autoSuggest` action:

1. Samples 3–5 representative chunks (first, middle, last — covering introduction, body, conclusion)
2. Sends them to GPT-4o-mini asking for 3–5 topic tags
3. For each suggested tag: normalize → check existence → create if new → add to document's `tagIds` with source "ai"

Why sample chunks, not the full document: token efficiency. 3–5 chunks (~600–1000 tokens) are sufficient for topic extraction. Sending all chunks would be wasteful and slow.

If the auto-suggest action fails (OpenAI error, rate limit), the document remains "ready" with no tags. The user can add tags manually. Failure is logged but doesn't affect document status — tags are an enhancement, not a requirement.

**Tag propagation to posts** uses runtime queries, not denormalization. Posts reference documents via `primarySourceDocumentId`. At query time, the feed resolves tags by reading the document and its `tagIds`.

Why runtime over denormalization:

| Approach                    | Read cost                                      | Write consistency                               |
| --------------------------- | ---------------------------------------------- | ----------------------------------------------- |
| Denormalize tags onto posts | Zero extra cost at render                      | Must update all posts when document tags change |
| Runtime query (chosen)      | 1 `db.get(documentId)` per unique doc per page | Always consistent                               |

Tags change — users add/remove them after posts are generated. Denormalization means every tag change triggers a fan-out update to all posts from that document. For a document with 50+ posts, that's 50+ `db.patch` calls.

The feed deduplicates document reads: for a 10-post page from 3 documents, that's 3 reads (not 10), plus batch tag name resolution across all unique `tagIds` on the page. Document reads are heavily cached by Convex's query layer since many posts share the same document.

### Alternatives considered

- **Junction table `documentTags`** — Clean "by tag" index, natural source tracking with a `source` field on junction rows. But adds an extra table and 2x queries for common reads. Overkill at personal scale (10–100 documents).
- **Embedded tag objects `[{id, source}]`** — Self-contained with source tracking, but Convex unions in arrays add validation overhead and can't use `v.id()` inside nested objects for index purposes.
- **Denormalize tags onto posts** — Zero extra cost at render, but every tag change triggers fan-out updates to all posts from that document. Write amplification outweighs the read savings.

## Consequences

- **Schema simplicity**: One new table (`tags`), two new optional fields on `documents` (`tagIds`, `tagSources`). No junction table, no new indexes on existing tables
- **Read cost (library)**: Unchanged for unfiltered views. Tag-filtered views add in-memory filtering over the existing `by_userId` scan — negligible at personal scale
- **Read cost (feed)**: One extra `db.get` per unique document per feed page, plus batch tag name resolution. For a 10-post page from 3 documents with 15 total tags: 3 + 15 = 18 point reads — well within Convex query budget
- **Write cost (tag change)**: Single `db.patch` on the document. No fan-out to posts. This is the key advantage of runtime resolution over denormalization
- **Write cost (auto-suggest)**: One OpenAI call per document (~600–1000 tokens) + N tag create/get mutations + 1 document patch. Runs asynchronously after pipeline completion
- **Consistency**: Tags on feed cards are always fresh — Convex's reactive queries mean tag changes immediately update any open feed or library view
- **Scale ceiling**: In-memory tag filtering breaks at ~1000+ documents per user, well beyond Scrollect's target. A `documentsByTag` denormalized table can be added later without changing document or tag schemas
- **Fragility risk**: Positional alignment of `tagIds` and `tagSources` arrays is fragile if mutated carelessly. All tag mutations must go through canonical functions that maintain both arrays atomically

## More Information

- Tag renaming is cheap: because `tagIds` stores IDs (not names), renaming a tag is a single `db.patch` on the `tags` row — zero fan-out.
- Tag merging (A into B) requires scanning documents that have A, replacing A with B in `tagIds`, then deleting A. Bounded at personal scale.
- The `normalizedName` field enables future fuzzy matching (e.g., Levenshtein distance) without schema changes.
