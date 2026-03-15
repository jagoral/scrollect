---
status: proposed
date: 2026-03-11
---

# ADR-003: Generate multiple card types with deduplication

## Context

The feed currently generates a single card type: insight cards. Each generation run randomly samples N chunks, sends them to GPT-4o-mini, and stores the result in the `posts` table with a 1:1 mapping (`sourceChunkId`). This has three limitations:

1. **Monotonous feed** — Every card is the same format: 2–4 sentence insight. No variety in how knowledge is presented.
2. **No deduplication** — Random sampling can select the same chunk across runs, producing near-duplicate cards.
3. **Single-chunk provenance** — Each card maps to exactly one chunk. No way to generate cards that synthesize multiple chunks (summaries) or connect concepts across documents (connections).

The target card types are:

| Type           | Description                                                     | Chunk cardinality                                    |
| -------------- | --------------------------------------------------------------- | ---------------------------------------------------- |
| **Insight**    | Key concept, fact, or takeaway                                  | 1+ chunks                                            |
| **Quiz**       | Reveal-to-answer flashcard (phase 1), multiple choice (phase 2) | 1+ chunks                                            |
| **Quote**      | Notable passage with attribution                                | 1 chunk                                              |
| **Summary**    | Condensed overview of a section or topic                        | 2–5 chunks                                           |
| **Connection** | Links concepts across different sections or documents           | 2–3 chunks, different `sectionTitle` or `documentId` |

## Decision

### 1. Discriminated union `typeData` with `postSources` junction

Keep one `posts` table. Add a `postType` discriminator for indexing and a `typeData` discriminated union field for type-specific data. Each card type gets its own strongly-typed shape — adding a new type or variant means adding one more object to the union, not polluting shared fields:

```ts
typeData: v.union(
  v.object({ type: v.literal("insight") }),
  v.object({ type: v.literal("quiz"), variant: quizVariant,
    question: v.string(), answer: v.string(), ... }),
  v.object({ type: v.literal("quote"), attribution: v.optional(v.string()) }),
  v.object({ type: v.literal("summary") }),
  v.object({ type: v.literal("connection") }),
)
```

**Why `typeData` over flat optional fields:**

- **Type safety** — A quiz card _must_ have `question` and `answer`. With flat optional fields, schema can't enforce this. With `typeData`, Convex validates the shape at write time.
- **Extensibility** — Adding a freeform quiz variant, a "timeline" card with `events: v.array(...)`, or a "comparison" card with `sideA`/`sideB` — each is a self-contained object in the union. No field collision, no growing pile of unrelated optionals.
- **Readability** — `post.typeData` contains exactly the fields relevant to that type.

**Why `postType` is duplicated alongside `typeData.type`:** Convex indexes can't reach into nested objects. To query posts by type (e.g., "all quiz cards for user X"), we need `postType` as a top-level indexed field. It always mirrors `typeData.type`.

**Provenance** lives in a `postSources` junction table with `postId`, `chunkId`, `documentId`, `userId`, and `role` (`"primary"` or `"supporting"`). Primary source metadata is denormalized onto `posts` (`primarySourceDocumentId`, `primarySourceDocumentTitle`, `primarySourceChunkId`, `primarySourceSectionTitle`) for cheap feed rendering — no join needed for the source badge. Supporting sources load only when the user opens the expand/detail sheet.

**Write path invariant:** All writes to `posts` go through a single canonical `insertPost` internal mutation that asserts `postType === typeData.type`, computes `sourceChunkHash` for multi-chunk cards, inserts the post, and inserts `postSources` rows. No other code path writes to `posts` directly.

The `by_userId_createdAt` compound index on `postSources` enables windowed dedup queries (only check against cards from the last 90 days), preventing unbounded growth.

### 2. Single-call mixed-type generation

One LLM call per generation batch. The prompt instructs the model to produce a mix of card types from the provided chunks — the model decides which type fits each chunk best.

**Why single call over separate per-type calls:**

| Concern    | Separate calls per type                   | Single mixed call                    |
| ---------- | ----------------------------------------- | ------------------------------------ |
| Latency    | N × type count calls                      | 1 call                               |
| Cost       | Higher (repeated context)                 | Lower (shared context)               |
| Coherence  | Types unaware of each other               | Model avoids redundancy across types |
| Complexity | Orchestrate parallel calls, merge results | Parse one structured response        |

The AI output uses structured JSON with `sourceChunkIndices` (array of indices referencing input chunks) to map cards back to source material, enabling multi-chunk provenance.

**Post-generation validation:** Cards are validated before storage. Missing required type-specific fields, quiz with answer verbatim in question, single-chunk summaries, same-document connections, and unknown types are dropped (not retried individually). If >50% of cards in a batch are dropped, retry the entire batch once.

**Feature flag:** A `MULTI_TYPE_GENERATION` environment variable controls whether the new multi-type prompt or legacy single-type prompt is used. Enables instant rollback without code deploy if card quality is poor in production.

### 3. Type-aware usage-weighted deduplication

Hard-excluding used chunks would exhaust source material too fast — especially when cards can (and should) reference the same chunk in different type contexts. A 5-document library might only have 50 chunks total.

**Strategy:**

1. Before generation, batch-fetch recent `postSources` for the user via `postSources.by_userId_createdAt` index (windowed to last 90 days — older cards are unlikely to cause meaningful duplicates).
2. Build an in-memory map: `chunkId → Set<postType>` (by joining each postSource's `postId` to `posts` to read `postType`).
3. Compute a weight for each chunk: `base × recency_boost × 1/(1 + totalUsage) × (1 + (5 - typesUsed) × 0.3)`. Recency boost gives 2x weight to chunks from documents uploaded in the last 48 hours, tapering to 1x over 7 days — fresh chunks dominate early runs, ensuring users see cards from newly uploaded content quickly.
4. Use weighted random sampling to select chunks for the batch.
5. **Hard constraint:** When the user has multiple documents, include at least 2 chunks from different documents in every batch. Connection cards can't be produced otherwise.
6. Pass type coverage info to the prompt: "Chunk 3 already has insight and quiz cards — prefer other types."

**Multi-chunk dedup:** For summary and connection cards, store a `sourceChunkHash` (SHA256 of sorted chunk IDs) on each post for O(1) exact-match lookups. Bounded to cards of the same `postType` created in the last 30 days.

**Why not hard exclusion:** The same chunk can legitimately produce a great insight AND a great quiz — these serve different learning purposes. Weighted sampling naturally balances novelty vs. reuse without a cliff edge. When >80% of a user's chunks have been used across all card types, the library is approaching exhaustion — the UI should prompt the user to upload more content rather than generating diminishing-quality cards.

### Alternatives considered

- **Flat optional fields instead of `typeData` union** — Simpler schema, but no per-type validation. A quiz stored without `question` would pass schema validation. Grows unbounded with types, field collisions between types.
- **Separate tables per type** (`quizPosts`, `quotePosts`) — Strongest per-type typing, but can't paginate across tables in Convex. Feed query would need to merge N cursors — impractical.
- **`v.any()` JSON blob** — Maximum flexibility but zero type safety. No schema validation, bugs surface at runtime not write time.
- **Hard chunk exclusion for dedup** — Exhausts a small library after ~10 generation runs. Weighted sampling gives a gradual falloff instead of a cliff edge.
- **Separate LLM calls per card type** — N× latency, higher cost (repeated context), types unaware of each other's output.

## Consequences

- **Schema complexity**: One new table (`postSources`), a discriminated union `typeData` field, and denormalized source fields on `posts`. Moderate increase, but the junction pattern is already established with bookmarks (ADR-002)
- **Type safety**: `typeData` enforces per-type field requirements at write time. A quiz card _cannot_ be stored without `question` and `answer` — Convex schema validation rejects it
- **Query cost (feed)**: Same as today — denormalized primary source eliminates extra joins. Full provenance loaded lazily on expand only
- **Query cost (dedup)**: One windowed index query on `postSources.by_userId_createdAt` + batch `db.get` for postType resolution per generation run. Capped by 90-day window. For a user with 200 recent posts: 1 index query + ~200 `db.get` calls
- **Extensibility**: Adding a new card type is a localized change — add to the union, update prompt, add validation rules, add frontend component. No existing types are affected. Active learning types (spaced repetition, apply, contradiction) fit naturally into the `typeData` union
- **Prompt complexity**: The multi-type prompt carries significant load (5+ type definitions, JSON structure, coverage hints, variety guidance). Prototype showed 7 cards from 5 chunks in 9.5s at $0.0002 — viable. If the >50% drop rate trigger fires frequently, a two-pass planner/generator architecture is the next step
- **Follow-up**: Issue for schema + typeData implementation, issue for multi-type generation pipeline, issue for frontend card type rendering (type-specific layouts, quiz tap-to-reveal, multi-source badge for connections)
