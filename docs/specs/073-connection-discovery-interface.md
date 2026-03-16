# Connection Discovery - Interface Design

Spec for issue #73, derived from ADR-008. Intended for the Backend Developer implementing the connection discovery pipeline.

## New types in `packages/backend/convex/feed/connectionDiscovery.ts`

```ts
export type ConnectionCandidate = {
  anchorChunkId: string;
  anchorDocumentId: string;
  anchorDocumentTitle: string;
  anchorContent: string;
  anchorSectionTitle?: string;
  anchorChunkIndex: number;
  matchChunkId: string;
  matchDocumentId: string;
  matchDocumentTitle: string;
  matchContent: string;
  matchSectionTitle?: string;
  matchChunkIndex: number;
  similarityScore: number;
};

export type DiscoverConnectionsArgs = {
  userId: string;
  documents: AnchorDocumentInfo[];
  chunkUsageMap: Map<string, { types: Set<string>; totalCount: number }>;
  vectorStore: VectorStore;
  embedder: EmbeddingProvider;
  maxCandidates: number;
  now: number;
};

export type AnchorDocumentInfo = {
  documentId: string;
  documentTitle: string;
  createdAt: number;
  chunks: AnchorChunkInfo[];
};

export type AnchorChunkInfo = {
  chunkId: string;
  content: string;
  chunkIndex: number;
  embeddingId: string;
  sectionTitle?: string;
};
```

## Public function signature

```ts
export async function discoverConnections(
  args: DiscoverConnectionsArgs,
): Promise<ConnectionCandidate[]>;
```

**Returns** an array of `ConnectionCandidate` sorted by `similarityScore` descending, capped at `maxCandidates`. May return fewer than `maxCandidates` if not enough high-quality pairs are found.

## Algorithm steps (pseudocode)

```
1. If documents.length < 2:
     Switch to within-document mode (see below).

2. Select up to MAX_ANCHOR_DOCS (3) anchor documents.
   Weight by: computeRecencyBoost(doc.createdAt, now) * (1 / (1 + connectionUsageCount))
   where connectionUsageCount = number of chunks from this doc already used in connection cards.

3. For each anchor document, sample up to MAX_ANCHOR_CHUNKS (5) chunks.
   Weight toward unused chunks (same logic as weightedSample).

4. For each anchor chunk:
   a. Retrieve the chunk's embedding vector via embedder.embed([chunk.content]).
   b. Call vectorStore.searchExcludingDocument({
        vector,
        userId,
        excludeDocumentId: anchor.documentId,
        topK: SEARCH_TOP_K (3),
      }).
   c. For each result where score >= SIMILARITY_THRESHOLD (0.82):
      Fetch the matched chunk's content from Convex (by chunkId from the payload).
      Create a ConnectionCandidate.

5. Deduplicate: group by (anchorDocumentId, matchDocumentId) pair.
   Within each group, if two candidates have anchor chunkIndex within
   DEDUP_CHUNK_DISTANCE (2), keep only the highest-scoring one.

6. Sort by similarityScore descending. Return top maxCandidates.
```

## Within-document fallback (single-document users)

When `documents.length === 1`:

```
1. Sample up to MAX_ANCHOR_CHUNKS (5) chunks from the document.
2. For each anchor chunk:
   a. Call vectorStore.search(vector, { userId }, topK: 5).
   b. Post-filter results to exclude:
      - The anchor chunk itself (same chunkId).
      - Chunks with the same sectionTitle as the anchor
        (or chunkIndex distance <= 10 if no sectionTitle).
   c. Keep results where score >= SIMILARITY_THRESHOLD.
3. Deduplicate, sort, return.
```

## New VectorStore method

Add to `providers/types.ts`:

```ts
export type SearchExcludingDocumentParams = {
  vector: number[];
  userId: string;
  excludeDocumentId: string;
  topK: number;
};

// Add to VectorStore interface:
searchExcludingDocument(
  params: SearchExcludingDocumentParams,
): Promise<VectorSearchResult[]>;
```

### Qdrant implementation in `providers/qdrant.ts`

```ts
async searchExcludingDocument(
  params: SearchExcludingDocumentParams,
): Promise<VectorSearchResult[]> {
  const data = await this.client.request(
    `/collections/${COLLECTION_NAME}/points/search`,
    {
      method: "POST",
      body: JSON.stringify({
        vector: params.vector,
        limit: params.topK,
        filter: {
          must: [
            { key: "userId", match: { value: params.userId } },
          ],
          must_not: [
            { key: "documentId", match: { value: params.excludeDocumentId } },
          ],
        },
        with_payload: true,
      }),
    },
  );
  // ... map results same as search()
}
```

### Stub implementation

The stub stores points in-memory and filters with `Array.filter()` - exclude points where `payload.documentId === excludeDocumentId`, then sort by cosine similarity and return topK.

## Constants for `feed/constants.ts`

```ts
export const SIMILARITY_THRESHOLD = 0.82;
export const MAX_ANCHOR_DOCS = 3;
export const MAX_ANCHOR_CHUNKS = 5;
export const SEARCH_TOP_K = 3;
export const DEDUP_CHUNK_DISTANCE = 2;
```

## Schema change in `lib/validators.ts`

Update the connection typeData to add optional key idea fields:

```ts
v.object({
  type: v.literal("connection"),
  sourceATitleHint: v.string(),
  sourceBTitleHint: v.string(),
  sourceAKeyIdea: v.optional(v.string()),
  sourceBKeyIdea: v.optional(v.string()),
});
```

Fields are optional for backward compatibility with existing connection cards.

## Validation change in `feed/validation.ts`

The `case "connection"` block currently requires `docIds.size < 2` to fail. For within-document connections (single-document users), relax this:

```ts
case "connection": {
  if (!card.sourceATitleHint || !card.sourceBTitleHint) return false;
  const docIds = new Set(card.sourceChunkIndices.map((i) => chunks[i]!.documentId));
  // Allow same-document connections when isWithinDocumentMode is true
  if (!isWithinDocumentMode && docIds.size < 2) return false;
  return true;
}
```

Pass `isWithinDocumentMode` as an additional parameter to `validateCard` (or add it to a validation context object to stay within the 3-param limit).

## Integration point in `feed/generation.ts`

The discovery step runs before the main LLM call. In `generate()`, after chunk selection:

```ts
const connectionCandidates = await discoverConnections({
  userId: user._id,
  documents: anchorDocs,
  chunkUsageMap,
  vectorStore: createVectorStore(),
  embedder: createEmbeddingProvider(),
  maxCandidates: 2,
  now,
});

// Inject candidate chunks into the selected set with a prompt marker
// (see connection-synthesis-prompt.md for the prompt template)
```
