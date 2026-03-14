# ADR-006: Tagging System

**Status:** Proposed
**Date:** 2026-03-12
**Author:** Scrollect Team

## Context

Users upload diverse content — books, articles, YouTube videos, PDFs — but have no way to organize or connect them by topic. The feed generator also lacks topic awareness: it can't filter by subject, and cross-document connections are purely coincidental rather than topic-driven.

Issue #43 proposes a tagging system where:

- AI auto-suggests 3-5 tags after document processing completes
- Users can manually add/remove tags
- Tags propagate to posts for feed filtering
- The library supports tag-based filtering

The core architectural question is **how to model tags in Convex**, a database with no JOINs, no subqueries, and where every query must use a single index. This shapes every downstream decision.

## Decisions

### 1. Embedded `tagIds` array on documents — no junction table

The issue proposes a `documentTags` junction table. This is the relational instinct, but it's wrong for Convex.

**Why a junction table is costly in Convex:**

| Operation                       | Junction table cost                                              | Embedded array cost                                                        |
| ------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Get tags for a document         | Query `documentTags.by_documentId` → N rows → N `db.get("tags")` | Read document → `tagIds` array → batch `db.get("tags")`                    |
| Get documents for a tag         | Query `documentTags.by_tagId` → N rows → N `db.get("documents")` | Query `documents.by_userId` → filter in memory by `tagIds.includes(tagId)` |
| Add a tag to a document         | Insert into `documentTags` + integrity check                     | `db.patch` the document's `tagIds` array                                   |
| Remove a tag                    | Find + delete junction row                                       | `db.patch` to filter out the ID                                            |
| Tag source tracking (ai/manual) | Free — `source` field on junction row                            | Requires a parallel `tagSources` map or separate tracking                  |

The junction table wins on "get all documents for tag X" (index scan vs full user scan + filter). But in Scrollect's access patterns:

- **"Show tags for this document"** is the hot path — called on every document card render in the library and every document detail page. Embedded array: 1 read + N `db.get`. Junction: 1 index query + N `db.get`. Comparable cost, but embedded avoids the junction row overhead.
- **"Filter library by tag"** is the second hottest path. With embedded arrays, this requires scanning all user documents and filtering in memory. With a junction table, you can index-query. However, users will have 10-100 documents (not 10,000). A full scan of 100 documents with in-memory filtering is fast and well within Convex query limits.
- **"Which documents have tag X"** at scale (1000+ documents per user) would favor the junction table. But Scrollect is a personal learning app — document counts stay low. If this assumption breaks, we can add a `documentsByTag` denormalized index table later without changing the document schema.

**Decision: Embedded `tagIds: v.array(v.id("tags"))` on documents.**

For tag source tracking (AI vs manual), store a parallel `tagSources` object on the document:

```ts
// On documents table:
tagIds: v.optional(v.array(v.id("tags"))),
tagSources: v.optional(v.object({
  // Map of tagId string → source
  // Convex doesn't support v.map(), so we use a record-like pattern
})),
```

However, Convex doesn't have a clean map/record validator. Instead, use a simpler parallel array:

```ts
tagIds: v.optional(v.array(v.id("tags"))),
tagSources: v.optional(v.array(v.union(v.literal("ai"), v.literal("manual")))),
```

The `tagSources` array is positionally aligned with `tagIds` — `tagSources[i]` is the source of `tagIds[i]`. This is maintained by the add/remove tag mutations, which always operate on both arrays atomically.

**Why `v.optional`:** Existing documents have no tags. Making these optional avoids a migration. New documents start with `undefined` (no tags yet) until the AI auto-suggest runs or the user adds tags manually.

#### Alternatives considered

| Approach                                    | Pros                                          | Cons                                                                                                         |
| ------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **Embedded `tagIds` array** (chosen)        | Simple reads, atomic updates, no extra table  | "Documents by tag" requires scan + filter; tag source tracking is positional                                 |
| **Junction table `documentTags`**           | Clean "by tag" index, natural source tracking | Extra table, 2x queries for common reads, more complex mutations                                             |
| **Embedded tag objects** (`[{id, source}]`) | Self-contained with source                    | Convex unions in arrays add validation overhead; can't use `v.id()` inside nested objects for index purposes |

### 2. Tag table with simple normalization

```ts
tags: defineTable({
  name: v.string(), // Display name (user's original casing)
  normalizedName: v.string(), // Lowercase, trimmed, whitespace-collapsed
  userId: v.string(),
  createdAt: v.number(),
})
  .index("by_userId", ["userId"])
  .index("by_userId_normalizedName", ["userId", "normalizedName"]);
```

**Normalization rules (MVP):**

1. Trim leading/trailing whitespace
2. Collapse internal whitespace to single space
3. Lowercase

This means "Machine Learning", "machine learning", and "machine learning" all resolve to the same tag. But "ML" and "machine-learning" remain separate.

**Why not synonym handling now:** Synonym resolution ("ML" ↔ "machine learning") requires either a curated synonym dictionary or an AI-powered dedup pass. Both add complexity for a marginal gain at MVP scale. The `normalizedName` field enables fuzzy matching later (e.g., Levenshtein distance on normalized names) without schema changes.

**Why `normalizedName` is a separate field:** The display name preserves the user's preferred casing ("React", "GraphQL", "iOS"). The normalized form is purely for dedup lookups. The `by_userId_normalizedName` index enables O(1) "does this tag already exist?" checks during creation.

**Tag creation flow:**

1. Normalize the input name
2. Query `tags.by_userId_normalizedName` for the user + normalized name
3. If exists → return existing tag ID (no duplicate)
4. If not → insert new tag with both `name` and `normalizedName`

**Per-user tags, not global:** Tags are scoped to individual users. "React" for user A and "React" for user B are separate rows. This is consistent with Scrollect's "personal, not social" principle. Global tags would require cross-user dedup, moderation, and create privacy leakage vectors (seeing that someone tagged a document reveals they have it).

### 3. AI auto-suggest: Hook into pipeline completion

The auto-suggest step runs after `checkCompletion()` in `pipeline/embedding.ts` marks a document as "ready". This is the right hook point because:

- All chunks are embedded and available for sampling
- The document status is "ready" — the user can see it in their library
- Tag suggestion is non-blocking — it doesn't gate the document's readiness

**Implementation approach:**

```
checkCompletion() → status = "ready"
                  → scheduler.runAfter(0, internal.tags.autoSuggest, { documentId })
```

The `autoSuggest` action:

1. Samples 3-5 representative chunks from the document (first, middle, last — to cover introduction, body, conclusion)
2. Sends them to GPT-4o-mini with a prompt asking for 3-5 topic tags
3. For each suggested tag: normalize → check existence → create if new → add to document's `tagIds` with source "ai"

**Why sample chunks, not the full document:** Token efficiency. 3-5 chunks (~600-1000 tokens) are sufficient for topic extraction. Sending all chunks would be wasteful and slow.

**Why not during chunking/parsing:** Tags need representative content. During parsing, we only have raw text. During chunking, we have fragments but no sense of the whole. After embedding, we have the complete chunked document and can sample intelligently.

**Failure handling:** If the auto-suggest action fails (OpenAI error, rate limit), the document remains "ready" with no tags. The user can add tags manually. The auto-suggest failure is logged but does not affect document status — tags are an enhancement, not a requirement.

### 4. Tag propagation to posts: Runtime query, not denormalization

Posts reference documents via `primarySourceDocumentId`. Two options for showing tags on feed cards:

| Approach                        | Read cost                                                                | Write consistency                               |
| ------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------- |
| **Denormalize tags onto posts** | Zero extra cost at render                                                | Must update all posts when document tags change |
| **Runtime query** (chosen)      | 1 `db.get(documentId)` per post → read `tagIds` → batch `db.get("tags")` | Always consistent                               |

**Why runtime query:**

1. **Tags change.** Users add/remove tags after posts are generated. Denormalization means every tag change triggers a fan-out update to all posts from that document. For a document with 50+ posts, that's 50+ `db.patch` calls — expensive and creates write amplification.

2. **The cost is low.** The feed already does `db.get(primarySourceChunkId)` per post (line 32 of `feed/queries.ts`). Adding `db.get(primarySourceDocumentId)` is one more point read per post. Document reads will be heavily cached by Convex's query layer since many posts share the same document.

3. **Tag display on feed cards is optional.** If performance becomes an issue, we can add a `tagIds` cache field on posts later as a pure optimization — the runtime query remains the source of truth.

**Optimization for the feed list query:** Rather than N separate `db.get` calls for N posts from the same document, deduplicate document IDs first:

```ts
// In feed.list query enrichment:
const uniqueDocIds = [...new Set(result.page.map((p) => p.primarySourceDocumentId))];
const docs = await Promise.all(uniqueDocIds.map((id) => ctx.db.get(id)));
const docMap = new Map(docs.filter(Boolean).map((d) => [d._id, d]));

// Then for each post:
const doc = docMap.get(post.primarySourceDocumentId);
const tagIds = doc?.tagIds ?? [];
```

For a feed page of 10 posts from 3 documents, this is 3 reads instead of 10.

To resolve tag names, batch-fetch unique tag IDs across all posts on the page:

```ts
const allTagIds = [
  ...new Set(
    result.page.flatMap((p) => {
      const doc = docMap.get(p.primarySourceDocumentId);
      return doc?.tagIds ?? [];
    }),
  ),
];
const tags = await Promise.all(allTagIds.map((id) => ctx.db.get(id)));
const tagMap = new Map(tags.filter(Boolean).map((t) => [t._id, t]));
```

For a user with 15 total tags, this is at most 15 point reads per page — trivial.

### 5. Library filtering by tag

The library page lists documents filtered by tag. With embedded `tagIds`:

```ts
// documents.listByTag query
const docs = await ctx.db
  .query("documents")
  .withIndex("by_userId", (q) => q.eq("userId", user._id))
  .collect();

return tagId ? docs.filter((d) => d.tagIds?.includes(tagId)) : docs;
```

This is a full scan of the user's documents with in-memory filtering. For 10-100 documents, this completes in single-digit milliseconds.

**Multi-tag filtering** (AND semantics — "show documents with BOTH 'React' AND 'TypeScript'"):

```ts
return selectedTagIds.length > 0
  ? docs.filter((d) => selectedTagIds.every((id) => d.tagIds?.includes(id)))
  : docs;
```

**Why not a dedicated index:** Convex indexes are prefix-based. You can't index an array field for "contains" queries. The only way to index this would be a denormalized `documentsByTag` table (junction-like), which we've decided against for MVP. The in-memory filter is sufficient for personal-scale document counts.

### 6. Future-proofing considerations

**Tag hierarchies (parent/child):** Adding `parentTagId: v.optional(v.id("tags"))` to the `tags` table is a backward-compatible schema addition. No existing fields change. Tree traversal queries ("all documents tagged with 'Programming' or any child of 'Programming'") would require loading the tag tree into memory and expanding tag IDs before filtering — feasible at personal scale.

**Tag categories (topic vs format vs difficulty):** Adding `category: v.optional(v.string())` to `tags` is backward-compatible. Existing tags default to "topic". The UI can then group tags by category.

**Cross-user analytics:** Per-user tags make this harder by design. If we later want "most popular tags across all users," we'd need a global `tagStats` table that aggregates counts. This is an explicit trade-off: privacy now, analytics later.

**Tag merging/renaming:** Because `tagIds` are embedded as IDs (not names), renaming a tag is a single `db.patch` on the `tags` row — zero fan-out. Merging two tags (A into B) requires scanning documents that have A, replacing A with B in their `tagIds`, then deleting A. At personal scale, this is a bounded operation.

**Decision:** The chosen schema (separate `tags` table + embedded `tagIds` on documents) supports all these extensions as backward-compatible additions. No schema decisions made now foreclose future options.

## Schema Design

```ts
// New table
tags: defineTable({
  name: v.string(),
  normalizedName: v.string(),
  userId: v.string(),
  createdAt: v.number(),
})
  .index("by_userId", ["userId"])
  .index("by_userId_normalizedName", ["userId", "normalizedName"]),

// Modified table: documents
documents: defineTable({
  title: v.string(),
  fileType,
  storageId: v.optional(v.id("_storage")),
  sourceUrl: v.optional(v.string()),
  status: documentStatus,
  failedAt: v.optional(failedAtStage),
  datalabCheckUrl: v.optional(v.string()),
  errorMessage: v.optional(v.string()),
  chunkCount: v.number(),
  userId: v.string(),
  createdAt: v.number(),
  // New fields
  tagIds: v.optional(v.array(v.id("tags"))),
  tagSources: v.optional(v.array(v.union(v.literal("ai"), v.literal("manual")))),
})
  .index("by_userId", ["userId"])
  .index("by_status", ["status"])
  .index("by_userId_status", ["userId", "status"]),
```

**No changes to `posts` or `postSources` tables.** Tags propagate to posts via the document reference at render time.

## Index Strategy

| Table  | Index                      | Fields                         | Purpose                                                 |
| ------ | -------------------------- | ------------------------------ | ------------------------------------------------------- |
| `tags` | `by_userId`                | `["userId"]`                   | List all tags for a user (autocomplete, tag management) |
| `tags` | `by_userId_normalizedName` | `["userId", "normalizedName"]` | O(1) dedup check during tag creation                    |

No new indexes on `documents` — tag filtering uses the existing `by_userId` index with in-memory filtering.

No new indexes on `posts` — tag display resolves via the existing `primarySourceDocumentId` → document → `tagIds` chain.

## Consequences

- **Schema simplicity:** One new table (`tags`), two new optional fields on `documents`. No junction table, no new indexes on existing tables.
- **Read cost (library):** Unchanged for unfiltered views. Tag-filtered views add in-memory filtering over the existing `by_userId` scan — negligible at personal scale (10-100 documents).
- **Read cost (feed):** One extra `db.get` per unique document per feed page (deduplicated across posts), plus batch tag name resolution. For a 10-post page from 3 documents with 15 total tags: 3 + 15 = 18 point reads. Well within Convex query budget.
- **Write cost (tag change):** Single `db.patch` on the document. No fan-out to posts. This is the key advantage of runtime resolution over denormalization.
- **Write cost (auto-suggest):** One OpenAI call per document (3-5 chunks, ~600-1000 tokens) + N tag create/get mutations + 1 document patch. Runs asynchronously after pipeline completion.
- **Consistency:** Tags on feed cards are always fresh — no stale denormalized data. Convex's reactive queries mean tag changes on a document immediately update any open feed or library view that references it.
- **Scale ceiling:** In-memory tag filtering on documents breaks at ~1000+ documents per user. This is well beyond Scrollect's target usage. If needed, a `documentsByTag` denormalized table can be added without changing the document or tag schemas.
- **Tag source tracking:** Positional alignment of `tagIds` and `tagSources` arrays is fragile if mutated carelessly. All tag mutations must go through canonical `addTagToDocument` / `removeTagFromDocument` functions that maintain both arrays atomically. No other code path should modify these fields directly.
