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

| Type           | Description                                                     | Chunk cardinality                                    |
| -------------- | --------------------------------------------------------------- | ---------------------------------------------------- |
| **Insight**    | Key concept, fact, or takeaway                                  | 1+ chunks                                            |
| **Quiz**       | Reveal-to-answer flashcard (phase 1), multiple choice (phase 2) | 1+ chunks                                            |
| **Quote**      | Notable passage with attribution                                | 1 chunk                                              |
| **Summary**    | Condensed overview of a section or topic                        | 2-5 chunks                                           |
| **Connection** | Links concepts across different sections or documents           | 2-3 chunks, different `sectionTitle` or `documentId` |

## Decisions

### 1. Schema: Single `posts` table with discriminated union `typeData`

Keep one `posts` table. Use a `postType` discriminator for indexing and a `typeData` discriminated union field for type-specific data. This gives each card type its own strongly-typed shape — adding a new type or variant means adding one more object to the union, not polluting shared fields.

Denormalize primary source metadata onto `posts` so the feed list query stays cheap (no extra joins for the source badge).

```ts
// lib/validators.ts
export const postType = v.union(
  v.literal("insight"),
  v.literal("quiz"),
  v.literal("quote"),
  v.literal("summary"),
  v.literal("connection"),
);

export const quizVariant = v.union(
  v.literal("reveal"),
  v.literal("multiple-choice"),
  v.literal("freeform"),
);

export const typeData = v.union(
  v.object({
    type: v.literal("insight"),
  }),
  v.object({
    type: v.literal("quiz"),
    variant: quizVariant,
    question: v.string(),
    answer: v.string(),
    // multiple-choice only
    options: v.optional(v.array(v.string())),
    correctIndex: v.optional(v.number()),
  }),
  v.object({
    type: v.literal("quote"),
    attribution: v.optional(v.string()),
  }),
  v.object({
    type: v.literal("summary"),
  }),
  v.object({
    type: v.literal("connection"),
  }),
);

// schema.ts — posts table
posts: defineTable({
  postType: postType, // denormalized for indexing (mirrors typeData.type)
  content: v.string(), // main card body (markdown), shared across all types
  typeData: typeData, // type-specific data, strongly typed per variant

  // Denormalized primary source (avoids join on feed list)
  primarySourceDocumentId: v.id("documents"),
  primarySourceDocumentTitle: v.string(),
  primarySourceChunkId: v.id("chunks"),
  primarySourceSectionTitle: v.optional(v.string()),
  primarySourcePageNumber: v.optional(v.number()),

  // Multi-chunk dedup: SHA256 hash of sorted source chunk IDs (set for summary/connection)
  sourceChunkHash: v.optional(v.string()),

  userId: v.string(),
  assetStorageId: v.optional(v.id("_storage")),
  reaction: v.optional(reactionType),
  createdAt: v.number(),
})
  .index("by_userId", ["userId"])
  .index("by_userId_type", ["userId", "postType"]);
```

**Why `typeData` instead of flat optional fields:**

- **Type safety** — A quiz card _must_ have `question` and `answer`. With flat optional fields, schema can't enforce this. With `typeData`, Convex validates the shape at write time.
- **Extensibility** — Adding a freeform quiz variant, a "timeline" card with `events: v.array(...)`, or a "comparison" card with `sideA`/`sideB` — each is a self-contained object in the union. No field collision, no growing pile of unrelated optionals.
- **Readability** — When reading a post, `post.typeData` contains exactly the fields relevant to that type. No need to mentally filter which optionals apply.

**Why `postType` is duplicated alongside `typeData.type`:** Convex indexes can't reach into nested objects. To query posts by type (e.g., "all quiz cards for user X"), we need `postType` as a top-level indexed field. It always mirrors `typeData.type`.

**Invariant enforcement:** All writes to `posts` must go through a single canonical `insertPost` internal mutation that asserts `postType === typeData.type` before inserting. No other code path should write to `posts` directly. This prevents drift between the two fields across future code paths (bulk import, migration scripts, admin tools).

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
  .index("by_userId", ["userId"])
  .index("by_userId_createdAt", ["userId", "createdAt"]);
```

The `by_userId_createdAt` compound index enables windowed dedup queries (e.g., only check against cards from the last 90 days), preventing unbounded growth as users accumulate thousands of posts.

**Note on type-aware dedup:** `postType` lives on `posts`, not `postSources`. To check which card types a chunk has already produced, query `postSources.by_chunkId` → fetch each linked post → read `postType`. This is an application-level join, not an index join. The `by_userId` index on `postSources` enables the batch optimization (fetch all sources for a user at once, build an in-memory map keyed by chunkId → set of postTypes).

#### Alternatives considered

| Approach                                                 | Pros                                                                                  | Cons                                                                                           |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| **Discriminated union `typeData`** (chosen)              | Strong per-type typing, self-contained shapes, easy to extend with new types/variants | Can't index into nested fields (solved by `postType` duplication)                              |
| **Flat optional fields**                                 | Simpler schema, fields are indexable                                                  | No per-type validation, grows unbounded with types, field collisions between types             |
| **Separate tables per type** (`quizPosts`, `quotePosts`) | Strongest per-type typing                                                             | Can't paginate across tables in Convex. Feed query would need to merge N cursors — impractical |
| **`v.any()` JSON blob**                                  | Maximum flexibility                                                                   | Zero type safety, no schema validation, bugs surface at runtime not write time                 |

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
      "variant": "reveal",
      "question": "What happens to the learning rate when...",
      "answer": "It decays exponentially because...",
      "content": "The learning rate schedule determines...",
      "sourceChunkIndices": [0, 2]
    },
    {
      "type": "quiz",
      "variant": "multiple-choice",
      "question": "Which regularization technique randomly disables neurons?",
      "answer": "Dropout",
      "options": ["L2 regularization", "Dropout", "Batch normalization", "Early stopping"],
      "correctIndex": 1,
      "content": "Regularization prevents overfitting by...",
      "sourceChunkIndices": [2]
    },
    {
      "type": "quote",
      "content": "> \"The best way to predict the future is to invent it.\"",
      "attribution": "Alan Kay, in Chapter 3",
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

The AI output maps directly to `typeData`: each card's type-specific fields become the `typeData` object, and `content` stays as the shared top-level field.

Each card includes `sourceChunkIndices` — an array of indices referencing the input chunks. This enables multi-chunk provenance.

**Token budget:** Average chunk ~200 tokens. With 10 chunks: ~2,000 input tokens + ~500 system prompt = ~2,500 prompt tokens. Output: quiz cards with multiple-choice average ~120-150 tokens (higher than simple insights at ~70). Conservative estimate for 12 mixed cards: ~1,500-2,000 completion tokens. Well within gpt-4o-mini limits (128k context, 16k output). Guard: if total input tokens exceed 8,000, split into multiple calls.

**Retry and error handling:** The single OpenAI call is a single point of failure — network errors, rate limits, or truncated JSON lose the entire batch.

- **Retry policy:** Exponential backoff with max 2 retries (delays: 2s, 4s). Applies to network errors, rate limits (429), and server errors (5xx).
- **Partial recovery:** If JSON parsing fails, attempt to salvage any valid cards from a partial response before retrying.
- **Latency budget:** Prototype showed 9.5s for 5 chunks. With 10 chunks and quiz variants, expect p50 ~12s, p95 ~20s, p99 ~30s. Generation runs in a Convex action (no user-facing timeout), so this is acceptable.

**Post-generation validation:**

Generated cards are validated before storage. Invalid cards are dropped (not retried individually):

| Condition                                                                         | Action                                                                                      |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Missing required type-specific fields (e.g., quiz without `question` or `answer`) | Drop card, log warning                                                                      |
| Quiz with `variant: "multiple-choice"` but missing `options` or `correctIndex`    | Drop card, log warning                                                                      |
| Quiz where `answer` string appears verbatim in `question`                         | Drop card, log warning (trivially obvious — zero API cost to detect)                        |
| `sourceChunkIndices` empty or contains out-of-range indices                       | Drop card, log warning                                                                      |
| Summary card with < 2 source chunks                                               | Drop card, log warning (don't downgrade — summary-style language reads oddly as an insight) |
| Connection card with all sources from same section/document                       | Drop card, log warning                                                                      |
| Unknown `type` or `variant` value                                                 | Drop card, log warning                                                                      |
| > 50% of cards in batch dropped                                                   | Retry entire batch once                                                                     |

**Feature flag:** An environment variable `MULTI_TYPE_GENERATION=true|false` controls whether the new multi-type prompt or the legacy single-type prompt is used. Enables instant rollback without code deploy if card quality is poor in production. This is environment-level for Phase 1. Future: move to a per-user flag in the database for A/B testing and gradual rollout.

### 3. Deduplication: Type-aware usage-weighted sampling

Hard-excluding used chunks would exhaust source material too fast — especially when cards can (and should) reference the same chunk in different type contexts.

**Strategy: Type-aware usage-weighted sampling**

1. Before generation, batch-fetch recent `postSources` for the user via `postSources.by_userId_createdAt` index (windowed to last 90 days — older cards are unlikely to cause meaningful duplicates).
2. Build an in-memory map: `chunkId → Set<postType>` (by joining each postSource's `postId` to `posts` to read `postType`).
3. Compute a weight for each chunk:
   ```
   typesUsed = number of distinct postTypes this chunk has contributed to
   totalUsage = total number of cards this chunk appears in
   weight = base_weight
     * recency_boost(document)
     * (1 / (1 + totalUsage))
     * (1 + (TARGET_TYPES - typesUsed) * TYPE_BONUS)
   ```
   Where `TARGET_TYPES = 5`, `TYPE_BONUS = 0.3`, and `recency_boost` gives 2x weight to chunks from documents uploaded in the last 48 hours (tapering linearly to 1x over 7 days). This solves the cold-start problem — fresh chunks dominate early runs, ensuring users see cards from newly uploaded content quickly.
4. Use weighted random sampling to select chunks for the batch.
5. **Guarantee cross-document/section representation:** When the user has multiple documents, always include at least 2 chunks from different documents in every batch. This is a hard constraint, not a weight — connection cards can't be produced otherwise.
6. Pass type coverage info to the prompt: "Chunk 3 already has insight and quiz cards — prefer other types."

**Multi-chunk dedup:** For summary and connection cards, check for overlapping source chunks before inserting. Comparison is bounded to cards of the same `postType` created in the last 30 days (not all-time) to avoid O(n²) growth. Exact dedup: store a chunk signature hash (sorted chunk IDs, hashed) on each post for O(1) exact-match lookups. Jaccard similarity (> 0.5) is reserved for a future periodic background cleanup job, not the hot write path.

**Why not hard exclusion:**

- A library of 5 short documents might only have 50 chunks total. Hard exclusion would exhaust the pool after ~10 generation runs.
- The same chunk can legitimately produce a great insight AND a great quiz — these serve different learning purposes.
- Weighted sampling naturally balances novelty vs. reuse without a cliff edge.

**Convex cost:** One indexed query on `postSources.by_userId_createdAt` (windowed to 90 days) to fetch recent sources, then batch `db.get()` calls to resolve `postType` from linked posts. For a user with 200 recent posts: 1 index query + ~200 `db.get()` calls (deduplicated by postId). Built as an in-memory map once per generation run. The 90-day window caps read cost even for power users with thousands of lifetime posts.

**Saturation threshold:** When > 80% of a user's chunks have been used across all card types, the library is exhausted. The generation pipeline should:

1. Show the user a message: "You've explored most of [Document Title]. Upload more content for fresh cards."
2. Shift toward re-surfacing high-engagement cards (liked/bookmarked) rather than generating from exhausted material.
3. Optionally generate "deeper" synthesis cards (connections across previously uncombined chunks).

Without this, the Nth generation run from a small library produces noticeably worse cards and the user blames the product. The saturation ratio is computed as `usedChunks / totalChunks` per document during the chunk selection phase.

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

**Prompt quality guidance:**

- **Connection specificity:** The prompt must instruct: "Connection cards must name at least one specific concept from each source and describe the relationship (contrast, extension, analogy, dependency)." A connection that says "Both chapters discuss machine learning" is structurally valid but useless. Bad connections are the most visible quality failure — users will perceive them as AI slop.
- **Quote content-sensitivity:** Quotes work well for books with strong authorial voice (philosophy, memoir) but poorly for technical documentation where no single sentence stands alone. Phase 2 should add a `contentStyle` hint at the document level (derived during summarization, see #54) to suppress quote generation for technical/academic content.

**Prompt evolution:** The single prompt carries significant cognitive load — 5+ type definitions, JSON structure, coverage hints, and variety guidance. Phase 1 ships this as a single call. If the >50% drop rate (batch retry trigger) fires more than once per 100 generation runs, that's the signal to ship two-pass: (1) a lightweight "planner" call that assigns types to chunks, (2) a "generator" call that produces cards given the plan. This is Phase 1.5, not a distant future optimization. For Phase 1, add prompt regression tests: a suite of 10-15 representative chunk sets with expected type distributions, run as part of CI against prompt changes.

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

### 6. Type extensibility

**Adding a new card type** (e.g., "timeline"):

1. **Add to `postType` union** and **add a new object to `typeData` union** in `lib/validators.ts`. The new object defines exactly the fields this type needs — no impact on other types.
2. **Update the generation prompt** to describe the new type and its expected JSON output.
3. **Update the response parser** to map the new type's AI output to its `typeData` shape + add validation rules.
4. **Add frontend card component** with type-specific rendering.
5. **If the type needs a different chunk selection strategy** (e.g., ordered chunks from one document), add a selection strategy in the generation action.

**Adding a variant to an existing type** (e.g., freeform quiz):

1. **Add to the variant union** inside the existing `typeData` object (e.g., add `v.literal("freeform")` to `quizVariant`).
2. **Add any new fields** needed by the variant (e.g., `rubric: v.optional(v.string())` for evaluating freeform answers).
3. **Update prompt and parser** to handle the new variant.
4. **Update frontend** to render the variant differently.

No migration needed in either case — existing posts retain their `typeData` shape unchanged.

**Constraint enforcement:** Some card types have implicit constraints not enforced by schema:

- Connection cards must reference chunks with different `sectionTitle` values or different `documentId`s (a user with 1 book should still get connections across chapters). Concretely: at least 2 source chunks must differ on `sectionTitle` or `documentId`.
- Summary cards must reference 2+ chunks.

These are enforced by post-generation validation (Section 2), not by schema constraints.

## Schema Change

Since we're in prototype phase, this is a clean-slate schema change — no migration needed. Existing data (documents, posts, chunks) will be deleted and reprocessed.

**Changes to `posts` table:**

- Remove: `sourceChunkId`, `sourceDocumentId`
- Add: `postType` (top-level, for indexing), `typeData` (discriminated union with per-type fields), `primarySourceDocumentId`, `primarySourceDocumentTitle`, `primarySourceChunkId`, `primarySourceSectionTitle`, `primarySourcePageNumber`
- Add index: `by_userId_type`

**New table:** `postSources` (with indexes `by_postId`, `by_chunkId`, `by_documentId`, `by_userId`)

**New field on `posts`:** `sourceChunkHash: v.optional(v.string())` — a SHA256 hash of sorted source chunk IDs, used for O(1) exact-match multi-chunk dedup. Set for summary and connection cards.

**Updated write path:** All writes go through a canonical `insertPost` internal mutation that: (1) asserts `postType === typeData.type`, (2) computes `sourceChunkHash` for multi-chunk cards, (3) inserts the post, (4) inserts `postSources` rows. No other code path writes to `posts` directly.

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

**One issue found:** The summary card referenced only 1 chunk instead of the required 2+. The model treated a self-contained chunk as sufficient for a summary. Fix: post-generation validation drops single-chunk summaries (see Section 2) — the model will produce a natural insight from that chunk in the next batch.

**Key takeaways:**

- OpenAI's JSON mode reliably produces structured output matching the schema.
- `sourceChunkIndices` (array of indices) is the cleanest way to map cards back to input chunks — the model handles it naturally.
- The model produces a reasonable type mix without explicit ratios.
- Multi-chunk cards benefit from 4-5+ input chunks for meaningful synthesis.
- Temperature 0.7 produces good variety.

## Implementation Recommendations

### Issue scope: 3 implementation issues

**Issue A: Schema + typeData discriminated union**

- Apply new `posts` schema with `postType`, `typeData`, and denormalized primary source fields
- Create `postSources` junction table
- Update `createPost` mutation, `feed.list` query, `bookmarks.listSaved` query
- Delete existing posts (prototype phase — clean slate)
- **Acceptance criteria:** New posts created with `typeData` matching their type. Convex rejects malformed `typeData` at write time. Feed list reads primary source from denormalized fields. `postSources` populated on generation.

**Issue B: Multi-type generation pipeline**

- Rewrite `feed.generation.generate` with new multi-type prompt
- Structured output parsing with post-generation validation
- Type-aware usage-weighted chunk sampling (dedup)
- Feature flag (`MULTI_TYPE_GENERATION`) for rollback
- Store results with `postType`, denormalized primary source, and `postSources`
- **Acceptance criteria:** Generation produces at least 3 different card types. Dedup reduces repeat chunks across runs. Multi-chunk cards (summary, connection) appear when sufficient chunks exist. Invalid cards are dropped per validation rules. First document processing triggers automatic generation if user has zero posts (the highest-leverage retention moment — the user just invested effort uploading and needs an immediate payoff).

**Issue C: Frontend card type rendering**

- Type-specific card layouts (quiz tap-to-reveal, quote styling, summary/connection visual treatment)
- Multi-source badge for connections
- Updated expand sheet to load full provenance from `postSources`
- **Acceptance criteria:** Each card type has a distinct visual treatment. Quiz cards have tap-to-reveal interaction. Source badge shows provenance for all types. Expand sheet shows all contributing chunks.

### Recommended order: A → B → C (with B and C parallelizable after A)

## Future: Feed Ordering and Engagement

The generation pipeline produces cards, but the **ordering** of cards in the feed is equally important for engagement. These rules split across two layers:

**Phase 1 rules:**

- **Hook card first** _(query-level)_: The `feed.list` query sorts the first card in each generation batch by an engagement priority (`quiz` > `connection` > `quote` > `summary` > `insight`). This requires a `batchId` or `generationRunId` field on posts to group cards from the same batch.
- **No consecutive same-type** _(client-side)_: The frontend interleaves cards by `postType` before rendering. This is a display concern, not a query concern — the paginated query returns cards in `createdAt` order, and the client reorders within each page. Simpler to implement and avoids complicating the Convex query.
- **Freshness badge** _(client-side)_: Cards where `primarySourceDocumentId` points to a document with `createdAt` within the last 48 hours get a visual "New" indicator. Resolved by comparing against document metadata already available in the denormalized fields.

**Phase 2: Adaptive difficulty**

Track quiz accuracy per user. If they're getting 90%+ correct, the content is too easy — shift toward harder synthesis cards (connections, summaries). Below 50%, shift toward foundational (insights, quotes). This is Duolingo's adaptive difficulty mechanic and the strongest retention signal.

## Future: Learning Loop and Active Card Types

The current 5 types are all **presentation formats** — they differ in how content looks. The `typeData` union is designed to grow toward **active learning** card types:

| Type                  | Description                                                                        | Why                                                         |
| --------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| **Spaced Repetition** | Re-surface liked cards at increasing intervals (1d, 3d, 7d, 14d)                   | #1 retention mechanic from Anki/Duolingo                    |
| **Apply**             | "How would you use [concept] in your current project?" — freeform, no right answer | Bridges knowing and doing                                   |
| **Contradiction**     | "In Doc A, author argues X. In Doc B, author argues Y."                            | Forces critical thinking — unique to multi-document systems |
| **Fill-in-the-blank** | Key sentence with a critical term removed                                          | More active than reading, lower friction than freeform quiz |
| **Micro-challenge**   | "In 2 sentences, explain [concept] to a junior developer"                          | Feynman technique as a card                                 |

None of these require schema changes — each is a new `typeData` union member.

**Quality feedback loop:** The `reaction` field on posts is a start, but reactions should feed back into generation:

- Thumbs-down on quiz cards → reduce quiz frequency for that user/topic
- Thumbs-up on connections → increase cross-document synthesis
- Track quiz answer correctness when freeform quizzes ship → spaced repetition integration

Hook points for this feedback are: the dedup weight formula (reaction signals per chunk) and the generation prompt (user preference hints). The architecture supports this without changes — reactions are already stored and queryable.

## Success Metrics

A **session** is defined as a continuous feed viewing period — starts when the feed page mounts, ends when the user navigates away or the app is backgrounded for > 5 minutes.

| Metric                     | Definition                                                  | Target                                               |
| -------------------------- | ----------------------------------------------------------- | ---------------------------------------------------- |
| **Cards per session**      | Avg cards scrolled into view per session                    | > 8                                                  |
| **Type engagement ratio**  | Reaction rate per card type                                 | Identify which types users love/ignore               |
| **Return rate**            | % of users who open the feed again within 48h               | > 40%                                                |
| **Quiz attempt rate**      | % of quiz cards where user taps to reveal/answer            | > 60%                                                |
| **Upload-to-card latency** | Time from document upload to first card in feed             | < 5 minutes                                          |
| **Dedup effectiveness**    | % of users reporting "I've seen this before"                | < 10%                                                |
| **First-batch diversity**  | Distinct `postType` values in user's first generation batch | >= 3 types (also serves as prompt regression signal) |

## Consequences

- **Schema complexity**: One new table (`postSources`), a discriminated union `typeData` field, and denormalized source fields on `posts`. Moderate increase, but the junction table pattern is already established with bookmarks.
- **Type safety**: The `typeData` discriminated union enforces per-type field requirements at write time. A quiz card _cannot_ be stored without `question` and `answer` — Convex schema validation rejects it.
- **Query cost (feed list)**: Same as today — denormalized primary source fields eliminate the extra join. Full provenance (all sources) loaded lazily on expand only.
- **Query cost (dedup)**: One windowed index query on `postSources.by_userId_createdAt` + batch `db.get()` for postType resolution per generation run. Capped by 90-day window.
- **Generation resilience**: Retry policy with exponential backoff. Partial JSON recovery. Feature flag for instant rollback.
- **Prompt engineering**: The multi-type prompt is complex. Prompt regression tests in CI catch quality regressions. Two-pass architecture planned for Phase 2.
- **Extensibility**: Adding a new card type or quiz variant is a localized change — add to the union, update prompt, add frontend component. No existing types are affected. Active learning types (spaced repetition, apply, contradiction) fit naturally into the `typeData` union.
