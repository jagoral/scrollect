import type { ChunkInfo } from "./sampling";
import type { EmbeddingProvider, VectorStore } from "../providers/types";

export const DEFAULT_SIMILARITY_THRESHOLD = 0.82;
const SEARCH_TOP_K = 20;
const MAX_SEED_CHUNKS = 5;
const MIN_CHUNK_INDEX_DISTANCE = 3;

export type ConnectionPair = {
  chunkA: ChunkInfo;
  chunkB: ChunkInfo;
  similarityScore: number;
  connectionType: "cross_document" | "within_document";
};

export type DiscoverConnectionsArgs = {
  allChunks: ChunkInfo[];
  userId: string;
  embedder: EmbeddingProvider;
  vectorStore: VectorStore;
  maxPairs: number;
  similarityThreshold?: number;
  randomFn?: () => number;
};

export async function discoverConnections(
  args: DiscoverConnectionsArgs,
): Promise<ConnectionPair[]> {
  const {
    allChunks,
    userId,
    embedder,
    vectorStore,
    maxPairs,
    similarityThreshold = DEFAULT_SIMILARITY_THRESHOLD,
    randomFn = Math.random,
  } = args;

  if (allChunks.length < 2) return [];

  const chunkMap = new Map(allChunks.map((c) => [c._id, c]));
  const chunkArrayIndexMap = new Map(allChunks.map((c, idx) => [c._id, idx]));
  const documentIds = new Set(allChunks.map((c) => c.documentId));
  const hasMultipleDocuments = documentIds.size >= 2;

  const seedChunks = selectSeedChunks({
    chunks: allChunks,
    count: MAX_SEED_CHUNKS,
    randomFn,
  });

  const seedTexts = seedChunks.map((c) => c.content);
  const seedVectors = await embedder.embed(seedTexts);

  const candidatePairs = new Map<string, ConnectionPair>();

  for (let i = 0; i < seedChunks.length; i++) {
    const seedChunk = seedChunks[i]!;
    const seedVector = seedVectors[i]!;

    const results = hasMultipleDocuments
      ? await vectorStore.searchExcludingDocument({
          vector: seedVector,
          userId,
          excludeDocumentId: seedChunk.documentId,
          topK: SEARCH_TOP_K,
        })
      : await vectorStore.search(seedVector, { userId }, SEARCH_TOP_K);

    for (const result of results) {
      if (result.payload.chunkId === seedChunk._id) continue;
      if (result.score < similarityThreshold) continue;

      const matchedChunk = chunkMap.get(result.payload.chunkId);
      if (!matchedChunk) continue;

      const isCrossDocument = seedChunk.documentId !== matchedChunk.documentId;
      const isWithinDocument = seedChunk.documentId === matchedChunk.documentId;

      if (isWithinDocument) {
        const seedIdx = seedChunk.chunkIndex ?? chunkArrayIndexMap.get(seedChunk._id);
        const matchIdx = matchedChunk.chunkIndex ?? chunkArrayIndexMap.get(matchedChunk._id);
        if (
          seedIdx !== undefined &&
          matchIdx !== undefined &&
          Math.abs(seedIdx - matchIdx) < MIN_CHUNK_INDEX_DISTANCE
        ) {
          continue;
        }
      }

      const pairKey = [seedChunk._id, matchedChunk._id].sort().join(":");
      const existing = candidatePairs.get(pairKey);
      if (!existing || result.score > existing.similarityScore) {
        candidatePairs.set(pairKey, {
          chunkA: seedChunk,
          chunkB: matchedChunk,
          similarityScore: result.score,
          connectionType: isCrossDocument ? "cross_document" : "within_document",
        });
      }
    }
  }

  const sorted = Array.from(candidatePairs.values()).sort(
    (a, b) => b.similarityScore - a.similarityScore,
  );

  return sorted.slice(0, maxPairs);
}

type SelectSeedArgs = {
  chunks: ChunkInfo[];
  count: number;
  randomFn: () => number;
};

function selectSeedChunks(args: SelectSeedArgs): ChunkInfo[] {
  const { chunks, count, randomFn } = args;

  const byDoc = new Map<string, ChunkInfo[]>();
  for (const chunk of chunks) {
    const docChunks = byDoc.get(chunk.documentId);
    if (docChunks) {
      docChunks.push(chunk);
    } else {
      byDoc.set(chunk.documentId, [chunk]);
    }
  }

  const seeds: ChunkInfo[] = [];
  const seedIds = new Set<string>();
  const docEntries = Array.from(byDoc.entries());

  let docIndex = 0;
  while (seeds.length < count && seeds.length < chunks.length) {
    const [, docChunks] = docEntries[docIndex % docEntries.length]!;
    const available = docChunks.filter((c) => !seedIds.has(c._id));
    if (available.length > 0) {
      const pick = available[Math.floor(randomFn() * available.length)]!;
      seeds.push(pick);
      seedIds.add(pick._id);
    }
    docIndex++;
    if (docIndex >= docEntries.length * count) break;
  }

  return seeds;
}
