# ADR-003: Multi-Type Card Generation with Deduplication

**Status:** Proposed
**Date:** 2026-03-11
**Author:** Scrollect Team

## Context

The feed currently generates a single card type: insight cards. Each generation run randomly samples N chunks, sends them to GPT-4o-mini, and stores the result in the `posts` table with a 1:1 mapping (`sourceChunkId`). This has three limitations:

1. **Monotonous feed** — Every card is the same format: 2-4 sentence insight. No variety in how knowledge is presented.
2. **No deduplication** — Random sampling can select the same chunk across runs, producing near-duplicate cards.
3. **Single-chunk provenance** — Each card maps to exactly one chunk. No way to generate cards that synthesize multiple chunks (summaries) or connect concepts across documents (connections).

The target card types are:

| Type           | Description                                                     | Chunk cardinality               |
| -------------- | --------------------------------------------------------------- | ------------------------------- |
| **Insight**    | Key concept, fact, or takeaway                                  | 1+ chunks                       |
| **Quiz**       | Reveal-to-answer flashcard (phase 1), multiple choice (phase 2) | 1+ chunks                       |
| **Quote**      | Notable passage with attribution                                | 1 chunk                         |
| **Summary**    | Condensed overview of a section or topic                        | 2-5 chunks                      |
| **Connection** | Links concepts across different documents                       | 2-3 chunks, different documents |

## Decisions

### 1. Schema: Single `posts` table with `postType` discriminator

Keep one `posts` table. Add a `postType` field as a required union discriminator and type-specific optional fields. Denormalize primary source metadata onto `posts` so the feed list query stays cheap (no extra joins for the source badge).

```ts
// lib/validators.ts
export const postType = v.union(
  v.literal("insight"),
  v.literal("quiz"),
  v.literal("quote"),
  v.literal("summary"),
  v.literal("connection"),
);

// schema.ts — posts table
posts: defineTable({
  postType: postType,
  content: v.string(),

  // Quiz fields (phase 1: reveal-to-answer)
  quizQuestion: v.optional(v.string()),
  quizAnswer: v.optional(v.string()),
  // Quiz fields (phase 2: multiple choice)
  quizOptions: v.optional(v.array(v.string())),
  quizCorrectIndex: v.optional(v.number()),
  // Quote fields
  quoteAttribution: v.optional(v.string()),

  // Denormalized primary source (avoids join on feed list)
  primarySourceDocumentId: v.id("documents"),
  primarySourceDocumentTitle: v.string(),
  primarySourceChunkId: v.id("chunks"),
  primarySourceSectionTitle: v.optional(v.string()),
  primarySourcePageNumber: v.optional(v.number()),

  userId: v.string(),
  assetStorageId: v.optional(v.id("_storage")),
  reaction: v.optional(reactionType),
  createdAt: v.number(),
})
  .index("by_userId", ["userId"])
  .index("by_userId_type", ["userId", "postType"]);
```

Full provenance lives in a junction table, loaded only when the user opens the expand/detail sheet:

```ts
// schema.ts — new table
postSources: defineTable({
  postId: v.id("posts"),
  chunkId: v.id("chunks"),
  documentId: v.id("documents"),
  userId: v.string(), // denormalized for batch dedup queries
  role: v.union(v.literal("primary"), v.literal("supporting")),
  createdAt: v.number(),
})
  .index("by_postId", ["postId"])
  .index("by_chunkId", ["chunkId"])
  .index("by_documentId", ["documentId"])
  .index("by_userId", ["userId"]);
```

**Note on type-aware dedup:** `postType` lives on `posts`, not `postSources`. To check which card types a chunk has already produced, query `postSources.by_chunkId` → fetch each linked post → read `postType`. This is an application-level join, not an index join. The `by_userId` index on `postSources` enables the batch optimization (fetch all sources for a user at once, build an in-memory map keyed by chunkId → set of postTypes).

#### Alternatives considered

| Approach                                                 | Pros                                                     | Cons                                                                                               |
| -------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| **Single table + optional fields** (chosen)              | Simple queries, Convex-native pagination, one feed query | Type-specific fields are optional (no schema enforcement per type), grows with types               |
| **Separate tables per type** (`quizPosts`, `quotePosts`) | Strong per-type typing                                   | Can't paginate across tables in Convex. Feed query would need to merge N cursors — impractical     |
| **Discriminated union `typeData` field**                 | Groups type-specific data, validatable at runtime        | Convex `v.union` on nested objects adds validator complexity. Harder to index type-specific fields |

**Scaling threshold:** If type-specific optional fields exceed ~8, migrate to a discriminated union `typeData` field:

```ts
// Future refactor if field count grows
typeData: v.union(
  v.object({ type: v.literal("quiz"), quizQuestion: v.string(), quizAnswer: v.string() }),
  v.object({ type: v.literal("quote"), quoteAttribution: v.optional(v.string()) }),
  v.object({ type: v.literal("insight") }),
  v.object({ type: v.literal("summary") }),
  v.object({ type: v.literal("connection") }),
);
```

This groups type-specific data and enables runtime validation per type. Not needed for Phase 1 (5 types, 5 optional fields).

### 2. Prompt strategy: Single call, mixed types, structured output

One OpenAI call per generation batch. The prompt instructs the model to produce a mix of card types from the provided chunks. The model decides which type fits each chunk best.

**Why single call:**

| Concern    | Separate calls per type                   | Single mixed call                    |
| ---------- | ----------------------------------------- | ------------------------------------ |
| Latency    | N × type count calls                      | 1 call                               |
| Cost       | Higher (repeated context)                 | Lower (shared context)               |
| Coherence  | Types unaware of each other               | Model avoids redundancy across types |
| Complexity | Orchestrate parallel calls, merge results | Parse one structured response        |

**Structured output schema** (OpenAI JSON mode):

```json
{
  "cards": [
    {
      "type": "insight",
      "content": "**Gradient descent** converges faster with...",
      "sourceChunkIndices": [0]
    },
    {
      "type": "quiz",
      "quizQuestion": "What happens to the learning rate when...",
      "quizAnswer": "It decays exponentially because...",
      "content": "The learning rate schedule determines...",
      "sourceChunkIndices": [0, 2]
    },
    {
      "type": "quote",
      "content": "> \"The best way to predict the future is to invent it.\"",
      "quoteAttribution": "Alan Kay, in Chapter 3",
      "sourceChunkIndices": [1]
    },
    {
      "type": "summary",
      "content": "These three chunks cover the core idea of...",
      "sourceChunkIndices": [0, 1, 2]
    },
    {
      "type": "connection",
      "content": "The concept of **feedback loops** in Chapter 2 mirrors...",
      "sourceChunkIndices": [1, 3]
    }
  ]
}
```

Each card includes `sourceChunkIndices` — an array of indices referencing the input chunks. This enables multi-chunk provenance.

**Token budget:** Average chunk ~200 tokens. With 10 chunks: ~2,000 input tokens + ~500 system prompt = ~2,500 prompt tokens. Output: ~12 cards at ~80 tokens each = ~960 completion tokens. Well within gpt-4o-mini limits (128k context, 16k output). Guard: if total input tokens exceed 8,000, split into multiple calls.

**Post-generation validation:**

Generated cards are validated before storage. Invalid cards are dropped (not retried individually):

| Condition                                                                 | Action                  |
| ------------------------------------------------------------------------- | ----------------------- |
| Missing required type-specific fields (e.g., quiz without `quizQuestion`) | Drop card, log warning  |
| `sourceChunkIndices` empty or contains out-of-range indices               | Drop card, log warning  |
| Summary card with < 2 source chunks                                       | Downgrade to insight    |
| Connection card with all sources from same document                       | Downgrade to summary    |
| > 50% of cards in batch dropped                                           | Retry entire batch once |

**Feature flag:** An environment variable `MULTI_TYPE_GENERATION=true|false` controls whether the new multi-type prompt or the legacy single-type prompt is used. Enables instant rollback without code deploy if card quality is poor in production.

### 3. Deduplication: Type-aware usage-weighted sampling

Hard-excluding used chunks would exhaust source material too fast — especially when cards can (and should) reference the same chunk in different type contexts.

**Strategy: Type-aware usage-weighted sampling**

1. Before generation, batch-fetch all `postSources` for the user via `postSources.by_userId` index.
2. Build an in-memory map: `chunkId → Set<postType>` (by joining each postSource's `postId` to `posts` to read `postType`).
3. Compute a weight for each chunk considering type coverage:
   ```
   typesUsed = number of distinct postTypes this chunk has contributed to
   totalUsage = total number of cards this chunk appears in
   weight = 1 / (1 + totalUsage) * (1 + (TARGET_TYPES - typesUsed) * TYPE_BONUS)
   ```
   Where `TARGET_TYPES = 5` and `TYPE_BONUS = 0.3`. Chunks with unused type potential get a boost.
4. Use weighted random sampling to select chunks for the batch.
5. Pass type coverage info to the prompt: "Chunk 3 already has insight and quiz cards — prefer other types."

**Multi-chunk dedup:** For summary and connection cards, add a post-storage check: after generation, before inserting, check if a card with the same `postType` and overlapping `sourceChunkIndices` (Jaccard similarity > 0.5) already exists for this user. If so, drop the duplicate.

**Why not hard exclusion:**

- A library of 5 short documents might only have 50 chunks total. Hard exclusion would exhaust the pool after ~10 generation runs.
- The same chunk can legitimately produce a great insight AND a great quiz — these serve different learning purposes.
- Weighted sampling naturally balances novelty vs. reuse without a cliff edge.

**Convex cost:** One indexed query on `postSources.by_userId` to fetch all sources for the user, then batch `db.get()` calls to resolve `postType` from linked posts. For a user with 200 posts and 400 postSource rows: 1 index query + ~200 `db.get()` calls (deduplicated by postId). Built as an in-memory map once per generation run.

**Known limitation:** Chunk-ID dedup does not catch semantically similar content from different chunks (e.g., a concept explained in both an introduction and a summary chapter). Embeddings-based semantic dedup is deferred to a future ADR — the existing Qdrant infrastructure could support it.

### 4. Feed mixing: AI-decided, configurable later

**Phase 1:** The generation prompt includes guidance on variety but no hard ratio. The model naturally produces a mix based on the input material. Some chunks lend themselves to quizzes; others to quotes. The frontend does not assume all types will always be present — some batches from a single technical document may produce zero quote or connection cards, and that's fine.

**Phase 2 (future):** Add a `generationConfig` table or user preference that specifies target ratios:

```ts
// Future: generationConfig table
generationConfig: defineTable({
  userId: v.string(),
  targetMix: v.object({
    insight: v.number(), // e.g., 0.4
    quiz: v.number(), // e.g., 0.3
    quote: v.number(), // e.g., 0.15
    summary: v.number(), // e.g., 0.1
    connection: v.number(), // e.g., 0.05
  }),
});
```

These ratios would be injected into the prompt: "Aim for approximately 40% insights, 30% quizzes..."

**Why AI-first:**

- The model can assess which chunks suit which card types better than a fixed ratio.
- Fixed ratios can force awkward fits (e.g., demanding a quiz from a chunk that's pure narrative).
- Starting with AI decisions lets us collect data on natural type distributions before tuning.

### 5. Provenance: Primary + supporting with flexible UI

The `postSources` junction table stores a `role` field:

- **`primary`**: The main chunk the card is derived from. Its metadata is denormalized onto `posts` for cheap feed rendering.
- **`supporting`**: Additional context chunks. Loaded only when the user opens the expand/context sheet.

For single-chunk cards (insights, quotes), there's one `primary` source.
For multi-chunk cards (summaries, connections), the most representative chunk is `primary`; others are `supporting`.

**Frontend rendering:**

- Source badge: Reads denormalized fields directly from `posts` — no join needed.
- Expand sheet: Queries `postSources.by_postId` to load all contributing chunks (primary highlighted, supporting in context).
- For connections: badge shows both document titles (e.g., "Doc A · Doc B").

This keeps feed list reads at the same cost as today (N+1 per post: post + bookmark check) while supporting full transparency on expand.

### 6. Type extensibility: Adding a new card type

Full steps to add a card type (e.g., "analogy", "timeline"):

1. **Add to `postType` union** in `lib/validators.ts`.
2. **Add optional type-specific fields** to `posts` table (if any).
3. **Update the generation prompt** to include the new type's description and output shape.
4. **Update the response parser** to handle the new type's fields and validation rules.
5. **Add frontend card component** with type-specific rendering.
6. **If the type needs a different chunk selection strategy** (e.g., a "timeline" card needs ordered chunks from one document), add a selection strategy in the generation action.

Existing posts are unaffected — they retain their type. New types appear only in new generation runs.

**Constraint enforcement:** Some card types have implicit constraints not enforced by schema:

- Connection cards must reference chunks from different documents.
- Summary cards must reference 2+ chunks.

These are enforced by post-generation validation (Section 2), not by schema constraints.

## Schema Change

Since we're in prototype phase, this is a clean-slate schema change — no migration needed. Existing data (documents, posts, chunks) will be deleted and reprocessed.

**Changes to `posts` table:**

- Remove: `sourceChunkId`, `sourceDocumentId`
- Add: `postType`, `quizQuestion`, `quizAnswer`, `quizOptions`, `quizCorrectIndex`, `quoteAttribution`, `primarySourceDocumentId`, `primarySourceDocumentTitle`, `primarySourceChunkId`, `primarySourceSectionTitle`, `primarySourcePageNumber`
- Add index: `by_userId_type`

**New table:** `postSources` (with indexes `by_postId`, `by_chunkId`, `by_documentId`, `by_userId`)

**Updated write path:** `createPost` mutation writes `postType` and all denormalized primary source fields. Generation action inserts `postSources` rows after creating each post.

## Prototype Results

A standalone prototype script (`spikes/multi-type-generation/prototype.ts`) validates the prompt strategy by sending 5 sample chunks (from 2 documents) to GPT-4o-mini.

**Run results (actual):**

- **7 cards produced** from 5 input chunks in a single call
- **Latency:** 9.5 seconds
- **Cost:** 1,328 tokens (817 prompt + 511 completion) — ~$0.0002 at gpt-4o-mini pricing
- **Type distribution:** insight 43%, quiz 14%, quote 14%, summary 14%, connection 14%
- **All 5 card types produced** without explicit ratio constraints
- **Cross-document connection worked:** the connection card linked regularization (Deep Learning) with feedback loops (Systems Thinking)
- **Quiz structure correct:** quizQuestion, quizAnswer, content all populated
- **Quote attribution correct:** extracted "Geoffrey Hinton" from inline citation

**One issue found:** The summary card referenced only 1 chunk instead of the required 2+. The model treated a self-contained chunk as sufficient for a summary. Fix: post-generation validation downgrades single-chunk summaries to insights (see Section 2).

**Key takeaways:**

- OpenAI's JSON mode reliably produces structured output matching the schema.
- `sourceChunkIndices` (array of indices) is the cleanest way to map cards back to input chunks — the model handles it naturally.
- The model produces a reasonable type mix without explicit ratios.
- Multi-chunk cards benefit from 4-5+ input chunks for meaningful synthesis.
- Temperature 0.7 produces good variety.

## Implementation Recommendations

### Issue scope: 3 implementation issues

**Issue A: Schema + postType discriminator**

- Apply new `posts` schema with `postType` and denormalized primary source fields
- Create `postSources` junction table
- Update `createPost` mutation, `feed.list` query, `bookmarks.listSaved` query
- Delete existing posts (prototype phase — clean slate)
- **Acceptance criteria:** New posts created with `postType`. Feed list reads primary source from denormalized fields. `postSources` populated on generation.

**Issue B: Multi-type generation pipeline**

- Rewrite `feed.generation.generate` with new multi-type prompt
- Structured output parsing with post-generation validation
- Type-aware usage-weighted chunk sampling (dedup)
- Feature flag (`MULTI_TYPE_GENERATION`) for rollback
- Store results with `postType`, denormalized primary source, and `postSources`
- **Acceptance criteria:** Generation produces at least 3 different card types. Dedup reduces repeat chunks across runs. Multi-chunk cards (summary, connection) appear when sufficient chunks exist. Invalid cards are dropped per validation rules.

**Issue C: Frontend card type rendering**

- Type-specific card layouts (quiz tap-to-reveal, quote styling, summary/connection visual treatment)
- Multi-source badge for connections
- Updated expand sheet to load full provenance from `postSources`
- **Acceptance criteria:** Each card type has a distinct visual treatment. Quiz cards have tap-to-reveal interaction. Source badge shows provenance for all types. Expand sheet shows all contributing chunks.

### Recommended order: A → B → C (with B and C parallelizable after A)

## Consequences

- **Schema complexity**: One new table (`postSources`), several optional fields and denormalized source fields on `posts`. Moderate increase, but the junction table pattern is already established with bookmarks.
- **Query cost (feed list)**: Same as today — denormalized primary source fields eliminate the extra join. Full provenance (all sources) loaded lazily on expand only.
- **Query cost (dedup)**: One `by_userId` index query on `postSources` + batch `db.get()` for postType resolution per generation run. Acceptable for action context.
- **Generation latency**: Unchanged — still one OpenAI call per batch. Post-generation validation adds negligible overhead.
- **Prompt engineering**: The multi-type prompt is more complex and will need iteration. Feature flag enables instant rollback if quality is poor.
- **Type safety gap**: Type-specific fields are optional at schema level — a quiz card could theoretically be stored without `quizQuestion`. Post-generation validation catches this at write time. If field count grows beyond ~8, migrate to discriminated union `typeData` field.
