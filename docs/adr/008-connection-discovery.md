---
status: proposed
date: 2026-03-16
---

# ADR-008: Connection discovery via chunk-level vector similarity

## Context

Issue #73 asks for cross-document connection cards - the most compelling differentiator for Scrollect. The multi-type card system (ADR-003) already defines a `connection` card type with `sourceATitleHint` and `sourceBTitleHint` in `typeData`, but connection generation today is entirely prompt-driven: the LLM is asked to find connections among whatever chunks the sampler happens to select. This produces low-quality connections because (a) randomly sampled chunks rarely have meaningful overlap, and (b) the LLM has no signal about which chunks are actually semantically related.

The infrastructure is ready: Qdrant stores per-chunk embeddings in `scrollect_chunks` with `userId`, `documentId`, and `chunkIndex` in the payload. The `VectorStore` interface exposes `search()` with a userId filter. The missing piece is a discovery algorithm that finds high-similarity chunk pairs across documents and feeds them to the LLM as pre-validated connection candidates.

Scrollect is a personal app (10-100 documents, typically 500-5000 chunks per user). The algorithm must be efficient at this scale but does not need to optimize for millions of vectors.

## Decision

### 1. Anchor-and-search discovery on the chunks collection

The algorithm picks a small number of "anchor" chunks from one document and searches Qdrant for their nearest neighbors in other documents. The Qdrant REST API supports `must_not` conditions, allowing us to exclude the anchor's own document from search results in the same query.

**Algorithm (`discoverConnections`):**

1. Select anchor documents - up to 3 documents, weighted by freshness and low connection-card usage (reusing `computeRecencyBoost` and `chunkUsageMap` from `sampling.ts`).
2. For each anchor document, sample up to 5 chunks (weighted toward unused chunks).
3. For each anchor chunk, call `searchExcludingDocument()` on the `VectorStore` with the chunk's embedding vector, filtering by `userId` and excluding the anchor's `documentId`. Request `topK: 3`.
4. Collect all (anchor, result) pairs where `score >= SIMILARITY_THRESHOLD` (0.82 default). Each pair is a `ConnectionCandidate`.
5. Deduplicate: if two candidates share the same (documentA, documentB) pair and their anchor chunks are within 2 `chunkIndex` positions of each other, keep only the highest-scoring one.
6. Sort by score descending. Return the top N candidates (where N is the requested connection count, typically 1-2 per generation batch).

**Why anchor-and-search over all-pairs or Qdrant recommend API:**

- All-pairs is O(n^2) in chunks - prohibitive even at personal scale (2500 pairs for 50 chunks).
- Qdrant's recommend API requires positive/negative point IDs, which maps poorly to "find cross-document similarity." It is designed for recommendation, not pairwise discovery.
- Anchor-and-search is O(anchors _ topK) Qdrant calls. With 3 documents _ 5 chunks \* 1 search each = 15 HTTP calls, each returning 3 results. Bounded and predictable.

**Why 0.82 threshold (not 0.80 from the issue):** Testing with OpenAI `text-embedding-3-small` shows that chunks from the same broad topic (e.g., "distributed systems") routinely score 0.78-0.81. A threshold of 0.80 admits too many topically-adjacent-but-not-insightful pairs. Starting at 0.82 and allowing downward tuning is safer than starting low and filtering noise.

### 2. Extend VectorStore interface with `searchExcludingDocument`

Add one method to the `VectorStore` interface:

```ts
searchExcludingDocument(params: {
  vector: number[];
  userId: string;
  excludeDocumentId: string;
  topK: number;
}): Promise<VectorSearchResult[]>;
```

The Qdrant implementation uses `must` for userId and `must_not` for documentId in the same filter. This is a standard Qdrant filter capability. The stub implementation filters in-memory.

**Why a new method instead of extending `VectorFilter`:** The existing `search()` method's filter is `{ userId }` and is used throughout the pipeline. Adding optional `excludeDocumentId` to `VectorFilter` would complicate every call site and make it easy to accidentally exclude documents. A dedicated method makes the intent explicit and keeps the common path clean.

### 3. Two-layer quality gate: threshold + LLM rejection

Layer 1 (vector similarity) filters out unrelated chunks. Layer 2 (LLM) filters out trivial connections. The `ConnectionCandidate` passed to the LLM includes both chunk texts and their document titles, so the model can assess whether the connection is insightful or merely topical.

The generation prompt for connection cards includes a rejection instruction:

> If the connection between these two passages is trivial (they merely discuss the same broad topic without a specific conceptual bridge), respond with `"rejected": true` and a brief reason. Only surface connections where the relationship reveals something non-obvious.

Rejected pairs are logged for threshold tuning but not retried - the generation pipeline moves on to other card types.

### 4. Within-document fallback for single-document users

When a user has only one document, the algorithm switches to within-document mode: anchor chunks search against chunks from the same document but in different sections. The `searchExcludingDocument` method is not used; instead, results are post-filtered to require `sectionTitle !== anchor.sectionTitle` (or `chunkIndex` distance > 10 for documents without section titles).

This reuses the same quality gate. Within-document connections are genuinely useful for long documents (e.g., "Chapter 1's discussion of X connects to Chapter 8's Y").

### 5. Enrich connection typeData with key idea hints

Add `sourceAKeyIdea` and `sourceBKeyIdea` to the connection `typeData` shape. These are short (1 sentence) descriptions of the key idea from each source, generated by the LLM alongside the connection text. They replace the current `sourceATitleHint`/`sourceBTitleHint` fields, which are redundant with `primarySourceDocumentTitle` already on the post.

Updated shape:

```ts
v.object({
  type: v.literal("connection"),
  sourceATitleHint: v.string(),
  sourceBTitleHint: v.string(),
  sourceAKeyIdea: v.string(),
  sourceBKeyIdea: v.string(),
});
```

The title hints are kept for backward compatibility with existing connection cards in the database.

### Alternatives considered

- **Qdrant recommend API** - Designed for "more like this" recommendations with positive/negative examples, not pairwise cross-document discovery. Would require constructing artificial positive/negative sets and still needs post-filtering by document. More complex with no quality advantage.
- **Summary-level discovery (compare document summaries instead of chunks)** - Faster (one vector per document), but too coarse. Two documents can share a high-level topic while having zero meaningful chunk-level connections. Chunk-level discovery finds the specific conceptual bridges that make connections insightful.
- **LLM-only discovery (no vector pre-filtering)** - Send all chunks to the LLM and let it find connections. Token cost scales linearly with library size and produces worse results because the LLM lacks the semantic similarity signal. The current prompt-driven approach is exactly this, and it produces low-quality connections.
- **Batch all anchors into a single Qdrant query** - Qdrant's search API takes a single vector, not a batch. The batch search endpoint exists but adds complexity for marginal latency savings at our scale (15 sequential calls take ~1-2s total).
- **Store connection candidates in a Convex table for reuse** - Pre-computing and caching connections adds a table, invalidation logic (when documents are added/deleted), and staleness risk. At 15 Qdrant calls per generation, computing on-the-fly is fast enough. Revisit if generation latency becomes a problem.

## Consequences

- **Connection quality**: Vector pre-filtering ensures the LLM only sees chunk pairs with genuine semantic overlap. The two-layer gate (threshold + LLM rejection) filters both unrelated and trivially-related pairs
- **Qdrant call budget**: 15 HTTP calls per generation run (3 docs \* 5 chunks). Each call is a simple search with filter - same cost as existing `semanticSelect`. Total added latency: ~1-2s
- **VectorStore interface change**: One new method on `VectorStore` and its implementations (Qdrant, stub). Existing `search()` callers are unaffected
- **Schema change**: Two new optional fields on connection `typeData` (`sourceAKeyIdea`, `sourceBKeyIdea`). Backward compatible - existing connection cards without these fields still render, just without key idea text
- **Single-document users**: Get within-document cross-section connections instead of nothing. Same quality gate applies
- **Threshold tuning**: The 0.82 default is a starting point. Log rejected/accepted pairs with scores to calibrate. The threshold is a constant in `feed/constants.ts`, not a schema field - changing it requires a code deploy, not a migration
- **Scale assumption**: The anchor-and-search approach works well for 10-100 documents. At 1000+ documents, the anchor selection step would need smarter sampling (e.g., cluster representatives). This is far outside Scrollect's target scale

## More Information

- ADR-003 defined the connection card type and validation rules (requires 2+ documents in `sourceChunkIndices`)
- The `SIMILARITY_THRESHOLD` constant belongs in `feed/constants.ts` alongside `FRESHNESS_WINDOW_MS` and `FRESHNESS_BOOST_FACTOR`
- Validation in `validation.ts` already enforces `docIds.size < 2` for connection cards. For within-document fallback, this check must be relaxed to allow same-document connections when the user has only one document
- The connection discovery step runs before the main generation LLM call. Discovered candidates are injected into the chunk selection as pre-paired chunks with a prompt hint: "These chunk pairs have been identified as potential connections"
