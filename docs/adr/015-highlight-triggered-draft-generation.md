---
status: proposed
date: 2026-03-24
---

# ADR-015: Highlight-triggered draft generation (Feed v2, sub-increment 1d)

## Context

Issue #147. ADR-013 established write-time draft generation scoped to sections (1a) and cross-section themes (1b). ADR-014 added connection discovery (1c). All three strategies trigger during initial document processing. Highlights arrive later - after a document is already `ready` - and represent the user's explicit signal of what matters. They deserve dedicated drafts that reference the highlighted passage directly, but the existing pipeline has no mechanism for post-processing generation triggered by external events.

The `cardDrafts` schema already supports `strategy: "highlight"` (ADR-013) and the `highlights` table exists with `by_userId_documentId` and `by_userId_externalId` indexes. The normalized substring matching pattern in `feed/logic/highlightMatching.ts` provides a proven approach for matching highlight text against chunk content.

## Decision

### 1. `HighlightDraftLlm` interface

New interface in `providers/types.ts`, separate from `CardDraftLlm`:

```ts
interface HighlightDraftLlm {
  generateDraftFromHighlight(opts: {
    highlightText: string;
    sectionSummary: string;
    sectionTitle: string;
    chunks: Array<{ content: string; chunkId: string }>;
    documentTitle: string;
  }): Promise<{
    card: {
      content: string;
      cardType: DraftCardType;
      typeData: Record<string, unknown>;
    };
    usage: TokenUsage;
  }>;
}
```

**Why a separate interface from `CardDraftLlm`:** Two structural differences. First, `HighlightDraftLlm` receives `highlightText` as a primary input - the LLM must ground its output in the highlighted passage, not just the section context. Second, the LLM selects the best-fit `cardType` (returned in the response) rather than the caller specifying it upfront. Short quotes become `quote` cards, factual claims become `quiz` cards, conceptual passages become `insight` cards. `CardDraftLlm.generateDraft` takes `cardType` as an input parameter and generates all 4 types per section - fundamentally different prompt structure.

**Why one draft per highlight, not four:** Highlights are focused, short passages. Generating all 4 card types from a single sentence produces 3 low-quality cards and 1 good one. Letting the LLM pick the best-fit type matches how highlights actually work - a verbatim quote naturally maps to a quote card, not a quiz.

**Why group by section, one LLM call per affected section:** Multiple highlights in the same section are batched into a single call with all their highlight texts. 10 highlights across 3 sections = 3 LLM calls, not 10. The LLM gets richer context about what the user cared about in that section and returns one draft per highlight. The `generateDraftFromHighlight` method is called once per section-group, receiving all highlights for that section - the `highlightText` parameter contains concatenated highlights with separators. Each returned card maps back to its highlight.

The service context:

```ts
type HighlightDraftGenerationServiceContext = {
  llm: HighlightDraftLlm;
};
```

### 2. Self-chaining scheduler pattern

Each generation round runs as an `internalAction` that processes up to 10 unprocessed highlights, then schedules the next round via `ctx.scheduler.runAfter(5000, ...)`. The chain terminates when no unprocessed highlights remain.

**Why not cron:** A cron would poll every document for every user on a fixed interval regardless of pending work. The self-chaining approach fires only when there is actual work (triggered by `importHighlights`), carries explicit context (`documentId`, `userId`) without auth propagation, and stops when done. Zero overhead for documents without pending highlights.

**Why 10 highlights per round:** Bounds instantaneous LLM cost per action invocation. 50 highlights = 5 rounds spread across ~25 seconds of scheduler delay plus LLM latency. The batch size is large enough to amortize the per-round overhead (document lookup, chunk queries) but small enough to keep individual action duration under Convex limits.

**Why 5-second delay between rounds:** Spreads LLM cost over time and avoids saturating the action queue during large imports. Not a hard requirement - the delay can be tuned without code changes.

**Termination conditions:** (a) No unprocessed highlights remain for the document. (b) Document status is `"deleting"` (deletion guard, checked at the start of each round). Both cause the chain to exit cleanly without scheduling a successor.

### 3. Highlight-to-section matching

Each highlight is matched to a section by testing whether the highlight text appears as a normalized substring within any chunk's content, where that chunk falls within a section's `chunkStartIndex`/`chunkEndIndex` range. This reuses the normalization approach from `feed/logic/highlightMatching.ts` (lowercase, trim).

The matching algorithm for a batch of highlights:

1. Load all chunks for the document
2. For each highlight, find chunks where `normalizedHighlightText` is a substring of `normalizedChunkContent`
3. For each matched chunk, determine which section owns it via `chunkStartIndex <= chunkIndex <= chunkEndIndex`
4. Group highlights by their matched section

Highlights that match no chunk (e.g., OCR artifacts, metadata text not in the main content) are marked `draftGenerated: true` and skipped. They are unmatched, not failed - no retry is appropriate.

### 4. Retry and backoff strategy

Convex scheduled actions are at-most-once with no automatic retry. If a round fails (LLM error, network timeout), the action re-schedules itself with exponential backoff: `ctx.scheduler.runAfter(2^retryCount * 1000, ...)` up to 3 retries.

After 3 failures on the same batch, mark all highlights in that batch as `draftGenerated: true` to prevent infinite retry loops, log the failure, and schedule the next round with fresh highlights. This matches the retry pattern in `cardDraftGeneration.ts:170-183`.

### 5. Atomic trigger from `importHighlights` mutation

When `importHighlights` completes with `imported > 0` for a document that has section summaries, the mutation schedules the first generation action via `ctx.scheduler.runAfter(0, ...)`. Because scheduling from a mutation is exactly-once in Convex, the trigger is guaranteed if the mutation commits. No separate trigger mechanism, no race conditions.

The action receives `documentId` and `userId` as explicit args since auth context does not propagate to scheduled functions.

**Guard: section summaries must exist.** If the document has no section summaries (e.g., processing failed before summarization), the trigger is skipped. Highlights are preserved and will be processed if the document is re-processed later and a future import occurs.

### 6. Schema changes

Add to `highlights` table:

- `draftGenerated: v.optional(v.boolean())` - tracks whether a highlight has been processed for draft generation. Optional for backward compatibility with existing highlights (existing rows have `undefined`, treated as `false`)

Add index to `highlights` table:

- `by_documentId_draftGenerated` on `["documentId", "draftGenerated"]` - enables efficient querying of unprocessed highlights per document. The generation action queries `eq("documentId", id).eq("draftGenerated", undefined)` and takes 10.

### Alternatives considered

- **Reuse `CardDraftLlm` with caller-specified card type** - Would require 4 LLM calls per highlight (one per card type), producing 3 wasted calls. Highlights are focused enough that the LLM reliably picks the right type. A dedicated interface with LLM-selected type is both cheaper and higher quality.

- **Process all highlights in a single action** - Unbounded LLM cost for large imports (100+ highlights from a Kindle export). The self-chaining pattern with batches of 10 bounds per-action cost while guaranteeing eventual completion.

- **Cron-based polling for unprocessed highlights** - Runs on a fixed schedule regardless of pending work. For a personal app with sporadic imports, this wastes resources and adds latency (average wait = half the cron interval). Event-driven self-chaining is immediate and zero-cost when idle.

- **Embed highlights and use vector similarity for section matching** - Overkill when the highlight text is a verbatim excerpt from the source. Normalized substring matching is deterministic, requires no external calls, and handles the common case perfectly. Embedding-based matching would only help for paraphrased highlights, which Kindle/Readwise exports do not produce.

- **Store highlight-to-section mapping permanently** - The mapping is only needed during draft generation and can be recomputed from chunks. Storing it adds a field to every highlight and a migration for existing data, with no read-time benefit.

- **Use `processingJobs` for batch tracking** - The self-chaining pattern already tracks progress implicitly (unprocessed highlights = remaining work). `processingJobs` adds a coordination row that would need cleanup and provides no benefit when batches are sequential, not parallel.

## Consequences

- **Draft quality**: Highlight-grounded prompts produce cards that directly reference what the user marked as important. Source fidelity is higher than section-scoped drafts because the LLM prompt includes the exact passage
- **Schema migration**: Adding `draftGenerated` field and `by_documentId_draftGenerated` index to `highlights` is backward compatible. Existing highlights have `undefined`, treated as unprocessed. A backfill is not needed unless we want to retroactively generate drafts for existing highlights (separate decision)
- **Pipeline independence**: Highlight draft generation is fully decoupled from the document processing pipeline. It runs after documents are `ready`, triggered by user action (import). No changes to `documentStatus`, `processingJobs`, or the existing pipeline stages
- **New provider artifacts**: `HighlightDraftLlm` interface, `AiSdkHighlightDraftLlm` implementation, `StubHighlightDraftLlm` for tests, `HighlightDraftGenerationServiceContext` type, `createHighlightDraftGenerationServiceContext` factory
- **New pipeline files**: `pipeline/highlightDraftGeneration.ts` (controller action with self-chaining), `pipeline/logic/highlightDraftGeneration.ts` (pure orchestration: matching, grouping, LLM calls, dedup)
- **Cascade considerations**: Document deletion already cascades highlights via `cascadeDeleteHighlights`. The deletion guard in each generation round prevents orphaned drafts. No new cascade paths needed
- **Scale assumption**: 10 highlights per round, sequential rounds with 5-second delays. 200 highlights (large Kindle export) = 20 rounds over ~2-3 minutes. Acceptable for a personal app. Would need parallel round processing at 1000+ highlights per document, well outside target scale

## More Information

- ADR-013 defined `cardDrafts` with `strategy: "highlight"` already in the schema and the `CardDraftLlm` interface that this ADR intentionally does not reuse
- ADR-012 establishes the service layer DI pattern (`{ input, services }`) that the highlight generation logic module will follow
- `feed/logic/highlightMatching.ts` provides the normalized substring matching pattern reused for highlight-to-section matching
- The `importHighlights` mutation in `highlights.ts` is the sole trigger point - no other entry point schedules highlight draft generation
