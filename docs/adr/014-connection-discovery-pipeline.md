---
status: proposed
date: 2026-03-24
---

# ADR-014: Connection discovery as a pipeline stage (Feed v2, sub-increment 1c)

## Context

Issue #146. ADR-008 defined the connection discovery algorithm (anchor-and-search over chunk embeddings), and ADR-013 defined the draft generation pipeline (section-scoped and thematic card drafts at write-time). The missing piece is wiring connection discovery into the pipeline so that cross-document and within-document connection drafts are generated automatically when a document completes processing.

ADR-008 designed discovery at the chunk level against the `scrollect_chunks` Qdrant collection. Since then, `sectionSummaries` with embeddings in the `scrollect_summaries` collection have been implemented. Section-level discovery is a better fit: it reduces Qdrant calls from O(chunks_in_doc) to O(sections_in_doc), produces semantically richer pairs (summaries capture the section's theme, not a single paragraph), and aligns with the section-scoped draft architecture from ADR-013. This ADR supersedes the chunk-level algorithm from ADR-008 section 1 with section-level discovery, while preserving ADR-008's two-layer quality gate (section 3) and within-document fallback (section 4).

## Decision

### 1. Section-level discovery using `SummaryVectorStore`

Discovery searches the `scrollect_summaries` Qdrant collection (section-type summaries only) instead of `scrollect_chunks`. For each section in the newly processed document, query `SummaryVectorStore.search()` with the section's embedding vector, filtering by `userId` and `summaryType: "section"`. Post-filter results to exclude same-document matches.

This reduces Qdrant calls from O(chunks) to O(sections) - a 10-section document makes 10 searches instead of ~50-150. Section summaries capture thematic intent better than individual chunks, producing higher-quality connection candidates.

### 2. `connectionPairs` table

New table tracking discovered section pairs and their draft generation status:

```ts
connectionPairs: defineTable({
  userId: v.string(),
  sectionSummaryIdA: v.id("sectionSummaries"),
  sectionSummaryIdB: v.id("sectionSummaries"),
  documentIdA: v.id("documents"),
  documentIdB: v.id("documents"),
  similarityScore: v.number(),
  connectionType: connectionType, // "cross_document" | "within_document"
  status: connectionPairStatus, // "pending" | "drafted" | "failed"
  createdAt: v.number(),
});
```

Pair ordering: `sectionSummaryIdA < sectionSummaryIdB` lexicographically to prevent duplicate pairs (A-B and B-A). `documentIdA` and `documentIdB` are denormalized from their respective section summaries to enable cascade delete via `by_documentIdA` and `by_documentIdB` indexes without joining through `sectionSummaries`.

Indexes: `by_userId`, `by_documentIdA`, `by_documentIdB`, `by_userId_status`.

### 3. `ConnectionDiscoveryLlm` interface

Separate from `CardDraftLlm` because the input shape is fundamentally different - two sections with their chunks instead of one:

```ts
interface ConnectionDiscoveryLlm {
  generateConnectionDraft(opts: {
    sectionA: {
      title: string;
      summary: string;
      chunks: Array<{ content: string; chunkId: string }>;
    };
    sectionB: {
      title: string;
      summary: string;
      chunks: Array<{ content: string; chunkId: string }>;
    };
    documentATitle: string;
    documentBTitle: string;
  }): Promise<{
    card: { content: string; typeData: Record<string, unknown> } | null;
    usage: TokenUsage;
  } | null>;
}
```

The nullable `card` return is the quality gate: `null` means the LLM rejected the pair as trivial. This is layer 2 of the two-layer gate from ADR-008 section 3.

The service context includes `llm` and `summaryStore`, but not `VectorStore` - chunks are loaded from Convex DB, not Qdrant:

```ts
type ConnectionDiscoveryServiceContext = {
  llm: ConnectionDiscoveryLlm;
  summaryStore: SummaryVectorStore;
};
```

### 4. Implicit re-trigger via new document arrival

When document B completes processing, its discovery pass searches B's sections against ALL existing section summaries in Qdrant (filtered by userId, post-filtered to exclude same-document). This naturally discovers B-A connections without re-triggering document A's pipeline. Cost is O(sections_in_new_doc) per document arrival, not O(total_sections^2).

### 5. Fire-and-forget scheduling from `transitionToReady()`

`transitionToReady()` sets `status: "ready"` BEFORE scheduling connection discovery via `ctx.scheduler.runAfter`. Connection discovery failure cannot block the pipeline or leave a document stuck in a non-ready state. This matches the existing pattern where tagging is scheduled as fire-and-forget from the same function.

### 6. Within-document fallback

When no cross-document matches exceed the similarity threshold, search within the same document's sections. This serves single-document users and long documents with rich internal connections. The `connectionType` field on `connectionPairs` distinguishes the two cases for analytics and UI display.

### 7. Two-layer quality gate

Layer 1: similarity threshold (configurable, default ~0.75). Section summaries are more semantically dense than chunks, so the threshold is lower than ADR-008's 0.82 chunk-level threshold. Layer 2: LLM rejection via `generateConnectionDraft` returning `null`. Both layers must pass for a connection draft to be created.

### 8. Connection drafts stored in existing `cardDrafts` table

Generated connection drafts are stored in `cardDrafts` with `strategy: "connection"`, `cardType: "connection"`, and `sectionSummaryId` pointing to one of the two connected sections (the "anchor" section from the new document). The `sourceChunkIds` array contains chunks from both sections. This reuses the existing draft infrastructure without schema changes to `cardDrafts`.

### Alternatives considered

- **Chunk-level discovery (ADR-008 section 1)** - O(chunks) Qdrant calls per document vs O(sections). Chunks are too granular for connection discovery - two chunks can be similar without their broader sections being meaningfully connected. Section summaries capture the right level of abstraction.

- **Dedicated cron job for periodic discovery** - Adds scheduling complexity and delay. Event-driven discovery via `transitionToReady` is simpler, immediate, and naturally idempotent (each document's sections are searched exactly once at processing time).

- **Re-trigger all existing documents when a new one arrives** - O(n) pipeline re-runs vs O(sections_in_new_doc) searches. The new document's discovery pass already finds all connections with existing documents because Qdrant searches are symmetric.

- **Reuse `CardDraftLlm` for connection drafts** - Input shape mismatch: `CardDraftLlm.generateDraft` takes one section; connection drafts require two sections with their respective chunks and document titles. Extending the interface would complicate it for all callers. A dedicated `ConnectionDiscoveryLlm` keeps both contracts focused.

- **Store connection pairs without a dedicated table (inline in `cardDrafts`)** - Loses the ability to track pairs that were discovered but rejected by the LLM (status "failed"). The `connectionPairs` table enables analytics on discovery hit rates and similarity threshold tuning.

## Consequences

- **Pipeline completion is unaffected**: Connection discovery runs after `ready` status is set. Users see their document as complete immediately; connection drafts appear asynchronously in the feed pool
- **Qdrant call budget**: O(sections_in_new_doc) searches on `scrollect_summaries`. A 10-section document makes 10 searches. Each returns top-5 results - bounded and predictable
- **New table**: `connectionPairs` adds cascade delete obligations on both `documentIdA` and `documentIdB`. Document deletion must query both indexes and delete matching rows
- **Schema additions**: `connectionPairs` table, `connectionType` validator (extracted from inline `typeData` definition), `connectionPairStatus` validator. No changes to `cardDrafts` - the `strategy: "connection"` value is already supported
- **Interface additions**: `ConnectionDiscoveryLlm` and `ConnectionDiscoveryServiceContext` in `providers/types.ts`. Both need stub implementations for testing
- **Scale assumption**: Section-level discovery works well for 10-100 documents (typically 3-30 sections each, so 30-3000 total section summaries in Qdrant). At 10,000+ sections, the post-filter-to-exclude-same-document approach may return too few cross-document results within top-K. This is far outside Scrollect's target scale

## More Information

- ADR-008 defined the original chunk-level algorithm. This ADR supersedes section 1 (anchor-and-search on chunks) with section-level discovery. Sections 3 (two-layer quality gate) and 4 (within-document fallback) are preserved
- ADR-013 defined `cardDrafts` with `strategy: "connection"` already in the schema, and the `generating_cards` pipeline stage
- ADR-012 establishes the service layer DI pattern (`{ input, services }`) that the connection discovery logic module will follow
- The `connectionType` discriminator in `typeData` (ADR-003) is reused for `connectionPairs` via an extracted validator
