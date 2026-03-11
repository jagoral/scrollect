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

Keep one `posts` table. Add a `postType` field as a union discriminator and type-specific optional fields.

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
  postType: postType, // NEW: card type discriminator
  content: v.string(), // main card body (markdown)
  quizQuestion: v.optional(v.string()), // quiz: the question
  quizAnswer: v.optional(v.string()), // quiz: the answer (reveal-to-answer)
  quizOptions: v.optional(v.array(v.string())), // quiz: multiple choice options (phase 2)
  quizCorrectIndex: v.optional(v.number()), // quiz: index of correct option (phase 2)
  quoteAttribution: v.optional(v.string()), // quote: who said it / source context
  userId: v.string(),
  assetStorageId: v.optional(v.id("_storage")),
  reaction: v.optional(reactionType),
  createdAt: v.number(),
})
  .index("by_userId", ["userId"])
  .index("by_userId_type", ["userId", "postType"]);
```

Replace the 1:1 `sourceChunkId` / `sourceDocumentId` fields with a junction table:

```ts
// schema.ts — new table
postSources: defineTable({
  postId: v.id("posts"),
  chunkId: v.id("chunks"),
  documentId: v.id("documents"),
  role: v.union(v.literal("primary"), v.literal("supporting")),
  createdAt: v.number(),
})
  .index("by_postId", ["postId"])
  .index("by_chunkId", ["chunkId"])
  .index("by_chunkId_postType", ["chunkId"]); // query join with posts for dedup
```

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

### 3. Deduplication: Chunk usage tracking with soft preference

Hard-excluding used chunks would exhaust source material too fast — especially when cards can (and should) reference the same chunk in different type contexts.

**Strategy: Usage-weighted random sampling**

1. Before generation, query `postSources` to count how many cards each chunk has contributed to.
2. Compute a weight for each chunk: `weight = 1 / (1 + usageCount)`.
3. Use weighted random sampling to select chunks for the batch.
4. Chunks with zero prior usage are strongly preferred; heavily-used chunks can still be selected but rarely.

**For type-aware dedup** (optional enhancement):

- Also query the `postType` of existing cards per chunk.
- A chunk that has produced an insight but no quiz gets higher weight for quiz generation.
- This can be passed to the prompt as context: "Chunk 3 already has an insight card — prefer other types."

**Why not hard exclusion:**

- A library of 5 short documents might only have 50 chunks total. Hard exclusion would exhaust the pool after ~10 generation runs.
- The same chunk can legitimately produce a great insight AND a great quiz — these serve different learning purposes.
- Weighted sampling naturally balances novelty vs. reuse without a cliff edge.

**Convex cost:**

- One indexed query on `postSources.by_chunkId` per candidate chunk.
- For a user with 500 chunks and 200 posts: ~500 index lookups in the selection phase. This runs inside an action (not a query), so it's acceptable.
- Optimization: batch the lookup by fetching all `postSources` for the user at once and building an in-memory map.

### 4. Feed mixing: AI-decided, configurable later

**Phase 1:** The generation prompt includes guidance on variety but no hard ratio. The model naturally produces a mix based on the input material. Some chunks lend themselves to quizzes; others to quotes.

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

- **`primary`**: The main chunk the card is derived from. Shown in the source badge.
- **`supporting`**: Additional context chunks. Accessible via the expand/context sheet.

For single-chunk cards (insights, quotes), there's one `primary` source.
For multi-chunk cards (summaries, connections), the most representative chunk is `primary`; others are `supporting`.

**Frontend rendering:**

- Source badge: Shows the primary source's document title + section/page.
- Expand sheet: Shows all contributing chunks (primary highlighted, supporting in context).
- For connections: badge shows both document titles (e.g., "Doc A · Doc B").

This keeps the default UX simple (one source badge) while supporting full transparency on expand.

### 6. Type extensibility: Add type = 3-step process

Adding a new card type (e.g., "analogy", "timeline"):

1. **Add to `postType` union** in `lib/validators.ts`.
2. **Add optional type-specific fields** to `posts` table (if any).
3. **Update the generation prompt** to include the new type's description and output shape.

No migration of existing data needed — existing posts retain their type, new types appear in new generation runs only.

For card types with fundamentally different input patterns (e.g., a "timeline" card that needs all chunks from a document in order), the generation action's chunk selection logic would need a new selection strategy. This is an action-level change, not a schema change.

## Migration Plan

### From current schema to new schema

1. **Add new fields** to `posts`: `postType`, quiz fields, quote fields. All optional initially.
2. **Backfill**: Set `postType = "insight"` on all existing posts (they're all insights).
3. **Make `postType` required** after backfill.
4. **Create `postSources` table**.
5. **Backfill `postSources`**: For each existing post, insert one row with `role = "primary"`, using the current `sourceChunkId` and `sourceDocumentId`.
6. **Deprecate** `sourceChunkId` and `sourceDocumentId` on `posts`. Keep them temporarily for backward compatibility, remove in a later migration.
7. **Update `feed.list` query** to join on `postSources` instead of reading `sourceChunkId` directly.

This is a zero-downtime migration — all steps are additive until the final deprecation.

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

**One issue found:** The summary card referenced only 1 chunk instead of the required 2+. The model treated a self-contained chunk as sufficient for a summary. Fix: strengthen the prompt constraint ("summary cards MUST synthesize 2+ chunks — if a chunk stands alone, make it an insight instead") or add post-generation validation that downgrades single-chunk summaries to insights.

**Key takeaways:**

- OpenAI's JSON mode reliably produces structured output matching the schema.
- `sourceChunkIndices` (array of indices) is the cleanest way to map cards back to input chunks — the model handles it naturally.
- The model produces a reasonable type mix without explicit ratios.
- Multi-chunk cards benefit from 4-5+ input chunks for meaningful synthesis.
- Temperature 0.7 produces good variety.

## Implementation Recommendations

### Issue scope: 3 implementation issues

**Issue A: Schema migration + postType discriminator**

- Add `postType` and type-specific fields to `posts`
- Create `postSources` junction table
- Backfill existing posts as insights
- Migrate `sourceChunkId` → `postSources`
- Update `feed.list` and `bookmarks.listSaved` queries
- **Acceptance criteria:** All existing posts queryable with new schema. `postType = "insight"` on all existing rows. `postSources` populated for all existing posts.

**Issue B: Multi-type generation pipeline**

- Rewrite `feed.generation.generate` with new prompt
- Structured output parsing for all 5 card types
- Usage-weighted chunk sampling (dedup)
- Store results with `postType` and `postSources`
- **Acceptance criteria:** Generation produces at least 3 different card types. Dedup reduces repeat chunks across runs. Multi-chunk cards (summary, connection) appear when sufficient chunks exist.

**Issue C: Frontend card type rendering**

- Type-specific card layouts (quiz flip, quote styling, etc.)
- Multi-source badge for connections
- Updated expand sheet for multi-chunk provenance
- **Acceptance criteria:** Each card type has a distinct visual treatment. Quiz cards have tap-to-reveal interaction. Source badge shows provenance for all types.

### Recommended order: A → B → C (with B and C parallelizable after A)

## Consequences

- **Schema complexity**: One new table (`postSources`), several optional fields on `posts`. Moderate increase, but the junction table pattern is already established with bookmarks.
- **Query cost**: Feed list query now joins `postSources` instead of reading a direct field. Cost increase is ~1 indexed query per post per page (same pattern as bookmark enrichment).
- **Generation latency**: Unchanged — still one OpenAI call per batch. Structured output adds no latency vs. current JSON mode.
- **Prompt engineering**: The multi-type prompt is more complex and will need iteration. The prototype validates feasibility but production quality requires tuning.
- **Backward compatibility**: Existing posts become `postType: "insight"` with a single primary source. No data loss, no breaking changes to the current feed experience.
