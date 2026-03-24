---
status: proposed
date: 2026-03-24
---

# ADR-013: Draft generation pipeline (Feed v2, sub-increments 1a + 1b)

## Context

Issue #141. The current feed generation system (`feed/logic/generateFeed.ts`) runs at read-time: every feed request selects random chunks, builds a large multi-type prompt, generates 5 cards, rejects ~80%, and retries up to 3 times. For a 700-page book (436 chunks) this takes ~4 minutes and produces 1-3 usable cards. The high rejection rate and latency make the feed unusable at scale.

Feed v2 moves card generation to write-time. During the document processing pipeline, after summarization completes, we generate focused card drafts scoped to individual sections. Each LLM call targets one section and one card type, producing near-zero rejection rates. Feed serving (sub-increment 2) reads from this pre-computed pool.

This ADR covers sub-increments 1a and 1b: section-scoped draft generation (insight, quiz, quote, summary) and thematic draft generation (insight, summary across sections). Connection drafts (1c) and highlight-triggered drafts (1d) are deferred but the schema must not preclude them.

## Decision

### 1. `cardDrafts` table schema

New table storing pre-generated card drafts:

```ts
cardDrafts: defineTable({
  documentId: v.id("documents"),
  sectionSummaryId: v.optional(v.id("sectionSummaries")),
  userId: v.string(),
  cardType: postType, // reuse existing PostType validator
  content: v.string(),
  typeData, // reuse existing TypeData union
  sourceChunkIds: v.array(v.id("chunks")),
  contentHash: v.string(), // SHA-256 of content for dedup
  qualityScore: v.number(), // 0.0-1.0, computed at generation time
  status: v.union(v.literal("pending"), v.literal("used"), v.literal("rejected")),
  generationBatch: v.number(), // which generation round (starts at 1)
  strategy: v.union(
    v.literal("section"),
    v.literal("thematic"),
    v.literal("highlight"),
    v.literal("connection"),
  ),
  createdAt: v.number(),
})
  .index("by_documentId", ["documentId"])
  .index("by_userId_status", ["userId", "status"])
  .index("by_documentId_status", ["documentId", "status"])
  .index("by_userId_contentHash", ["userId", "contentHash"]);
```

**Why `sectionSummaryId` over `sectionTitle`:** Section titles are not unique within a document (e.g., multiple "Introduction" sections in a long book). The foreign key is unambiguous and enables context retrieval during regeneration. The field is `v.optional()` because future strategies (thematic 1b, connection 1c, highlight 1d) produce drafts that may span multiple sections or have no section scope. Section-scoped drafts (1a) always populate this field.

**Why reuse `typeData` from `lib/validators.ts`:** Card drafts have the same type-specific data shape as finalized posts. Reusing the existing discriminated union avoids duplication and ensures a draft can be promoted to a post without data transformation. The `connection` variant in the union is unused in 1a but structurally harmless.

**Why `status` over a boolean `served` flag:** Three states capture the full lifecycle. `pending` drafts are available for feed serving. `used` drafts have been promoted to posts. `rejected` drafts are excluded from serving but retained so regeneration prompts can avoid similar content. The rejection mutation ships with the feedback loop increment, but the field costs nothing to include now.

**Why `generationBatch`:** Simple integer starting at 1. When feed serving exhausts all `pending` drafts for a document, it can trigger generation of batch 2. Without this field, regeneration would require a migration. The regeneration trigger logic is deferred but the schema is ready.

**Why `strategy`:** Distinguishes how a draft was produced. Section-scoped drafts (1a) use `"section"`, thematic drafts (1b) use `"thematic"`. Future increments add `"connection"` (1c) and `"highlight"` (1d). This enables strategy-specific analytics and regeneration behavior.

### 2. `"generating_cards"` pipeline stage

Add `"generating_cards"` to `documentStatus` and `failedAtStage` validators. The pipeline flow becomes:

```
parsing -> chunking -> embedding -> summarizing -> generating_cards -> ready
                                                                        \-> (fire-and-forget) tagging
```

After summarizing completes, instead of transitioning directly to `ready`, transition to `generating_cards` and schedule draft generation. After all section batches complete via `processingJobs.checkCompletion`, trigger thematic generation (if 3+ sections) and then transition to `ready` and trigger tagging.

The resume handler (`pipeline/resume.ts`) gets a new `"generating_cards"` case that re-triggers draft generation, mirroring the `"summarizing"` resume path.

### 3. Batch generation using `processingJobs` pattern

One `processingJobs` row per document, one batch per section. This mirrors the proven pattern in `pipeline/embedding.ts`:

1. Summarizing completes, transitions document to `"generating_cards"`
2. Query `sectionSummaries` for the document
3. Create a `processingJobs` row with `totalBatches = sectionCount`
4. For each section, schedule a `generateDraftsForSection` action via `ctx.scheduler.runAfter(0, ...)`
5. Each batch generates drafts for all 4 card types for that section (4 parallel LLM calls via `Promise.allSettled` within one action)
6. On batch completion, call `processingJobs.markBatchComplete`
7. On all batches complete (including partial failures), trigger thematic generation (section 8) or transition to `ready` if below the 3-section threshold

**Why one batch per section (not per section x card type):** Reduces `processingJobs` row count and scheduler overhead. A document with 10 sections creates 10 batches, not 40. Each batch makes 4 LLM calls in parallel via `Promise.allSettled` - individual call failures are isolated without affecting the other card types in the same batch.

**Why parallel LLM calls within one batch:** Each card type for a section gets an independent focused prompt with no shared state. `Promise.allSettled` provides both parallelism (reducing per-section latency by ~4x) and per-call failure isolation. Results are processed sequentially after all calls settle for deduplication and quality filtering. Parallelism is also achieved across sections via `ctx.scheduler.runAfter`.

**Partial failure resilience:** If 2 of 10 section batches fail, the 8 successful batches' drafts are preserved. Failed batches retry up to 3 times with exponential backoff (matching the embedding retry pattern). The document transitions to `ready` even if some batches failed - partial drafts are better than none.

**Deletion guard:** Each batch action handler must check `doc.status === "deleting"` before writing drafts and exit early if true. This matches the existing pattern in `embedding.ts:65` and `summarizing.ts:40`. Without this guard, in-flight batches during a concurrent document delete can create orphaned `cardDrafts` rows that survive the cascade delete.

### 4. `CardDraftLlm` provider interface

New interface in `providers/types.ts`, following the ADR-012 service layer pattern:

```ts
interface CardDraftLlm {
  generateDraft(opts: {
    cardType: "insight" | "quiz" | "quote" | "summary";
    sectionSummary: string;
    sectionTitle: string;
    chunks: Array<{ content: string; chunkId: string }>;
    documentTitle: string;
  }): Promise<{
    card: { content: string; typeData: Record<string, unknown> };
    usage: TokenUsage;
  }>;
}
```

**Why one call per card type (not mixed-type like the current `CardGenerationService`):** The current mixed-type prompt asks the LLM to produce multiple types at once and achieves ~20% acceptance. Per-type prompts are shorter, more focused, and produce near-zero rejection because the LLM isn't choosing between types - it's fulfilling a specific contract. Cost per call is lower even though there are more calls, because context size is smaller (section summary + 2-3 chunks vs. 10+ chunks).

**Why `Record<string, unknown>` for `typeData` output:** Matches the existing `CardGenerationService` pattern (ADR-012) - avoids circular dependencies between `providers/` and `lib/validators.ts`. The caller casts to the concrete type at the boundary.

The service context follows the established pattern:

```ts
type DraftGenerationServiceContext = {
  llm: CardDraftLlm;
};
```

Analytics capture is handled by the controller (action handler), not the logic module, following the ADR-012 pattern where business logic remains logging-unaware.

### 5. Representative chunk selection

For each section, select 2-3 representative chunks using the `chunkStartIndex`/`chunkEndIndex` range from `sectionSummaries`:

- First chunk in range (opening context)
- Last chunk in range (closing context)
- Middle chunk if range spans 5+ chunks (core content)

These chunks are passed alongside the section summary in the prompt. The summary provides context; the chunks provide source material for verbatim quotes, specific facts, and quiz questions. This ensures source fidelity without sending entire sections to the LLM.

### 6. Content hash dedup

Before storing a draft, compute `contentHash = SHA-256(content)` and check the `by_userId_contentHash` index. If a draft with the same hash exists for the user, skip storage. This prevents duplicate content across sections (e.g., overlapping themes) and across generation batches.

### 7. Quality scoring

Score is 0.0-1.0, computed as weighted average:

- **Structural completeness** (weight 0.4): binary - passes `validateDraft()` structural checks = 1.0, fails = 0.0. Note: the existing `validateCard()` cannot be reused directly because its signature requires `sourceChunkIndices` (positional indices into a prompt's chunk array), while drafts store `sourceChunkIds` (Convex document IDs). A purpose-built `validateDraft()` function handles the same structural completeness checks (required fields per card type, quiz answer-leak detection, summary multi-chunk requirement) adapted for the draft data shape
- **Content length** (weight 0.3): <50 chars = 0.0, 50-100 chars = 0.5, 100-400 chars = 1.0, 400-800 chars = 0.75, >800 chars = 0.5
- **Source chunk coverage** (weight 0.3): 1 chunk = 0.5, 2+ chunks = 1.0. Exception: quote type always 1.0 (quotes naturally reference one chunk)

Drafts with `qualityScore < 0.3` are discarded (not stored). This threshold filters out structurally invalid or degenerate content while preserving reasonable drafts for feed serving to rank.

### 8. Thematic draft generation (sub-increment 1b)

After all section batches complete, the pipeline discovers cross-section themes and generates drafts that synthesize content across multiple sections. This produces higher-level "insight" and "summary" cards that surface patterns a section-scoped approach cannot.

#### ThematicLlm interface

New interface in `providers/types.ts`, separate from `CardDraftLlm`:

```ts
interface ThematicLlm {
  discoverThemes(opts: {
    sectionSummaries: Array<{ sectionTitle: string; summary: string }>;
    documentTitle: string;
  }): Promise<{
    themes: Array<{ title: string; description: string; relevantSections: string[] }>;
    usage: TokenUsage;
  }>;
}
```

**Why a separate interface from `CardDraftLlm`:** Different input/output shapes - `discoverThemes` takes the full set of section summaries and returns structured theme objects, while `generateDraft` takes a single section with chunks and returns a card. Interface segregation keeps both contracts focused. Per-theme card generation reuses `CardDraftLlm.generateDraft` (insight and summary types only) since the card shape is identical to section-scoped drafts.

**Why only insight and summary card types:** Quiz and quote types require single-section grounding - quizzes need specific facts from one section, and quotes need verbatim text from one chunk. Thematic drafts synthesize across sections, making these types unreliable.

#### ThematicDraftGenerationServiceContext

```ts
type ThematicDraftGenerationServiceContext = {
  thematicLlm: ThematicLlm;
  draftLlm: CardDraftLlm;
  embedder: EmbeddingProvider;
  vectorStore: VectorStore;
};
```

The embedder and vectorStore are needed to find representative chunks for each theme via semantic search within the document's chunks in Qdrant.

#### VectorFilter extension

Add optional `documentId` to `VectorFilter` for searching within a single document's chunks:

```ts
interface VectorFilter {
  userId: string;
  documentId?: string;
}
```

This enables theme-to-chunk matching: embed the theme description, search against only the source document's chunks, and use the top results as `sourceChunkIds` for the generated draft. Existing callers that omit `documentId` are unaffected.

#### Integration with the pipeline

`checkCompletion` in `cardDraftGeneration.ts` triggers thematic generation after ALL section batches complete, BEFORE transitioning to `ready`. The flow becomes:

```
section batches complete -> checkCompletion -> thematic generation -> transitionToReady
```

Thematic generation runs as a single scheduled action (not batched via `processingJobs`). A document with 10 sections typically produces 5-10 themes, each generating 2 card drafts (insight + summary) - 10-20 LLM calls total, handled within one action via `Promise.allSettled`.

**Minimum section threshold:** Documents with fewer than 3 sections skip thematic generation entirely. Cross-section themes require sufficient breadth to be meaningful - a 2-section document has no emergent themes beyond what section-scoped drafts already cover.

**The thematic action calls `transitionToReady()` itself on completion.** When `checkCompletion` detects all section batches are done, it schedules the thematic action instead of calling `transitionToReady` directly. The thematic action owns the final transition.

#### Failure isolation

Thematic failure must not block pipeline completion. The failure hierarchy is:

1. **Theme discovery failure** (the `discoverThemes` call fails): Skip all theme processing, call `transitionToReady` immediately. Section drafts are fully preserved.
2. **Per-theme card generation failure**: Isolated via `Promise.allSettled`. If 3 of 8 themes fail, the 5 successful themes' drafts are stored. The action still transitions to `ready`.
3. **Thematic action-level failure** (unexpected crash): `transitionToReady` is called in a `finally` block, ensuring the document never gets stuck in `generating_cards`.

Section drafts are preserved regardless of thematic outcomes. The thematic step is strictly additive.

#### DraftRecord shape for thematic drafts

Thematic drafts use the existing `cardDrafts` schema with these field values:

- `strategy`: `"thematic"`
- `sectionSummaryId`: `undefined` (themes span multiple sections, no single section scope)
- `sourceChunkIds`: populated from Qdrant semantic search results (may span multiple sections)
- `generationBatch`: `1` (same generation round as section drafts)
- `cardType`: `"insight"` or `"summary"` only

#### New files

- `providers/thematicLlm.ts` - `AiSdkThematicLlm` implementation using Vercel AI SDK
- `pipeline/logic/thematicDraftGeneration.ts` - pure orchestration logic (theme discovery, chunk retrieval, draft generation, dedup)
- `pipeline/thematicDraftGeneration.ts` - Convex action controller (separate from `cardDraftGeneration.ts` to keep section and thematic concerns isolated)

### Alternatives considered

- **Mixed-type generation (one call per section, all types at once)** - This is the current approach in `generateFeed.ts`. Achieves ~20% acceptance rate because the LLM struggles to satisfy multiple type contracts simultaneously. Per-type calls are more predictable and cheaper per accepted card.

- **Document-level generation (no section scoping)** - Loses section attribution, which is essential for the source badge in the UI and for highlight-triggered regeneration (1d). Section scoping also naturally bounds prompt size.

- **Store drafts in the `posts` table with a `draft` status** - Pollutes the feed query path. Posts are the user-facing feed; drafts are an internal pipeline artifact. Separate tables allow independent indexing and lifecycle management.

- **Qdrant-based chunk selection for representative chunks** - Overkill for within-section selection where we have 3-15 chunks with known index positions. First/middle/last by index is deterministic, fast, and requires no external calls.

- **No `generationBatch` field** - Saves one field but makes regeneration require a schema migration. The field is a simple integer with no write overhead.

- **`rejectionReason` field in 1a schema** - The exact taxonomy ("not_interesting", "already_know", "wrong_type", "low_quality") hasn't been validated with users. Included as `v.optional(v.string())` despite being speculative - zero storage cost when unset and avoids a future migration when the feedback loop ships.

- **Read-time generation with caching** - Per-type prompts could be executed at read-time with results cached, making the first load slow but subsequent loads instant. Rejected for three reasons: (a) first-load latency remains unacceptable for UX - users expect immediate feed content, (b) cache invalidation complexity when prompts or section summaries change, (c) write-time pre-computation enables draft pool analytics, quality scoring, and regeneration workflows that a cache layer cannot support.

- **Batch thematic generation via `processingJobs` (one batch per theme)** - Would mirror the section-scoped pattern exactly. Rejected because theme count (5-10) is too small to justify the `processingJobs` overhead, and themes are discovered dynamically (batch count unknown upfront). A single action with `Promise.allSettled` is simpler and sufficient.

- **Extend `CardDraftLlm` with a `discoverThemes` method** - Keeps one interface. Rejected because theme discovery has a fundamentally different contract (section summaries in, structured themes out) than draft generation (section + chunks in, card out). A combined interface violates interface segregation and makes stubbing harder in tests.

- **Generate all 4 card types for thematic drafts** - Would maximize draft pool variety. Rejected because quiz and quote types require single-section grounding for accuracy. A thematic quiz question without a clear source section creates attribution problems in the UI.

- **Run thematic generation in parallel with section batches** - Would reduce total pipeline time. Rejected because thematic generation needs section summaries as input, which are only guaranteed stable after summarization completes. Running them in parallel with section draft generation is feasible but adds coordination complexity with no meaningful latency benefit (thematic adds ~20-30s after section batches).

## Consequences

- **Pipeline duration**: Section draft generation adds ~60-80 seconds for a 10-section document (4 LLM calls per section, ~15-20s each, parallelized across sections). Thematic generation adds ~20-30 seconds after section batches complete (theme discovery + 10-20 parallel card generation calls). Total pipeline time for a 10-section document: ~80-110 seconds. Acceptable for a write-time operation that runs once per document
- **Draft volume**: A 10-section document produces ~20-40 section-scoped drafts (4 types per section, minus dedup and quality filtering) plus ~10-20 thematic drafts (5-10 themes x 2 types). A 700-page book (~30 sections) produces ~80-140 total drafts
- **Feed serving becomes instant**: Sub-increment 2 reads from the `cardDrafts` pool instead of generating on-the-fly. Feed latency drops from ~4 minutes to milliseconds
- **Schema extensibility**: `strategy`, `generationBatch`, and `status` fields support 1c/1d and the feedback loop without migration. Connection drafts add `strategy: "connection"`, highlight-triggered add `strategy: "highlight"`. Thematic drafts (1b) now use `strategy: "thematic"` with `sectionSummaryId: undefined`
- **Testability**: `CardDraftLlm` and `ThematicLlm` interfaces enable unit testing both generation paths with stub responses. The `{ input, services }` pattern from ADR-012 applies to both `generateDraftsForSection` and thematic generation logic modules
- **VectorFilter widening**: Adding optional `documentId` to `VectorFilter` is backward compatible but requires updating all `VectorStore.search` implementations (currently `QdrantVectorStore`) to conditionally apply the document filter. Stub implementations in tests need the same update
- **Cascade delete**: Document deletion must cascade to `cardDrafts` via the `by_documentId` index, added to the existing delete flow in `documentActions.ts`
- **Resume path**: `pipeline/resume.ts` needs a `"generating_cards"` case. If draft generation failed, re-query sections and re-trigger batch generation. Already-stored drafts from successful batches are preserved (idempotent via content hash dedup)

## More Information

- ADR-003 defines the `TypeData` union and `postType` validator reused by `cardDrafts`
- ADR-008 defines connection discovery - deferred to sub-increment 1c, but `strategy: "connection"` is ready in the schema
- ADR-012 establishes the service layer DI pattern (`{ input, services }`) used for `generateDraftsForSection`
- The existing `validateCard()` in `feed/logic/validation.ts` provides the reference for structural validation rules, but a purpose-built `validateDraft()` is needed due to the `sourceChunkIndices` vs `sourceChunkIds` signature mismatch
- Follow-up issues needed: 1c (connection pipeline stage), 1d (highlight-triggered regeneration), sub-increment 2 (ranking queue + feed serving), sub-increment 3 (feedback loop + rejection UI)
