import { describe, expect, test } from "bun:test";

import { discoverConnections, DEFAULT_SIMILARITY_THRESHOLD } from "./discovery";
import type { ChunkInfo } from "./sampling";
import type { EmbeddingProvider, VectorSearchResult, VectorStore } from "../providers/types";

function makeChunk(overrides: Partial<ChunkInfo> & { _id: string; documentId: string }): ChunkInfo {
  return {
    content: `Content for ${overrides._id}`,
    documentTitle: `Doc ${overrides.documentId}`,
    ...overrides,
  };
}

function mockFetchContent(
  chunks: ChunkInfo[],
): (chunkIds: string[]) => Promise<Map<string, string>> {
  const contentMap = new Map(chunks.map((c) => [c._id, c.content]));
  return async (chunkIds: string[]) => {
    const result = new Map<string, string>();
    for (const id of chunkIds) {
      const content = contentMap.get(id);
      if (content) result.set(id, content);
    }
    return result;
  };
}

function createMockEmbedder(vectorMap?: Map<string, number[]>): EmbeddingProvider {
  return {
    dimensions: 3,
    embed: async (texts: string[]) => {
      return texts.map((t) => {
        if (vectorMap) {
          for (const [key, vec] of vectorMap) {
            if (t.includes(key)) return vec;
          }
        }
        return [Math.random(), Math.random(), Math.random()];
      });
    },
  };
}

type MockSearchFn = (
  vector: number[],
  filter: { userId: string },
  topK: number,
) => VectorSearchResult[];

function createMockVectorStore(searchFn: MockSearchFn): VectorStore {
  return {
    ensureCollection: async () => {},
    upsert: async () => {},
    search: async (vector, filter, topK) => searchFn(vector, filter, topK),
    searchExcludingDocument: async (params) =>
      searchFn(params.vector, { userId: params.userId }, params.topK),
    delete: async () => {},
  };
}

describe("discoverConnections", () => {
  test("returns empty array when fewer than 2 chunks", async () => {
    const chunks = [makeChunk({ _id: "c1", documentId: "d1" })];
    const result = await discoverConnections({
      allChunks: chunks,
      userId: "user1",
      embedder: createMockEmbedder(),
      vectorStore: createMockVectorStore(() => []),
      fetchContent: mockFetchContent(chunks),
      maxPairs: 3,
    });
    expect(result).toEqual([]);
  });

  test("discovers cross-document connections above threshold", async () => {
    const chunks = [
      makeChunk({ _id: "c1", documentId: "d1", content: "distributed consensus" }),
      makeChunk({ _id: "c2", documentId: "d1", content: "Raft protocol" }),
      makeChunk({ _id: "c3", documentId: "d2", content: "CAP theorem" }),
      makeChunk({ _id: "c4", documentId: "d2", content: "eventual consistency" }),
    ];

    const vectorStore = createMockVectorStore((_vector, _filter, _topK) => {
      // Return c3 as similar to any query (simulating cross-doc match)
      return [
        {
          id: "vec-c3",
          score: 0.92,
          payload: { chunkId: "c3", documentId: "d2", chunkIndex: 0, userId: "user1" },
        },
        {
          id: "vec-c1",
          score: 0.95,
          payload: { chunkId: "c1", documentId: "d1", chunkIndex: 0, userId: "user1" },
        },
      ];
    });

    const result = await discoverConnections({
      allChunks: chunks,
      userId: "user1",
      embedder: createMockEmbedder(),
      vectorStore,
      fetchContent: mockFetchContent(chunks),
      maxPairs: 3,
      randomFn: () => 0.1,
    });

    expect(result.length).toBeGreaterThanOrEqual(1);
    for (const pair of result) {
      expect(pair.connectionType).toBe("cross_document");
      expect(pair.similarityScore).toBeGreaterThanOrEqual(DEFAULT_SIMILARITY_THRESHOLD);
      expect(pair.chunkA.documentId).not.toBe(pair.chunkB.documentId);
    }
  });

  test("falls back to within-document connections for single document", async () => {
    const chunks = [
      makeChunk({ _id: "c1", documentId: "d1", content: "intro chapter" }),
      makeChunk({ _id: "c2", documentId: "d1", content: "middle chapter" }),
      makeChunk({ _id: "c3", documentId: "d1", content: "conclusion chapter" }),
      makeChunk({ _id: "c4", documentId: "d1", content: "appendix" }),
    ];

    const vectorStore = createMockVectorStore((_vector, _filter, _topK) => {
      // c1 is similar to c4 (far apart in document)
      return [
        {
          id: "vec-c4",
          score: 0.88,
          payload: { chunkId: "c4", documentId: "d1", chunkIndex: 3, userId: "user1" },
        },
        {
          id: "vec-c1",
          score: 0.99,
          payload: { chunkId: "c1", documentId: "d1", chunkIndex: 0, userId: "user1" },
        },
      ];
    });

    const result = await discoverConnections({
      allChunks: chunks,
      userId: "user1",
      embedder: createMockEmbedder(),
      vectorStore,
      fetchContent: mockFetchContent(chunks),
      maxPairs: 2,
      randomFn: () => 0.1,
    });

    expect(result.length).toBeGreaterThanOrEqual(1);
    for (const pair of result) {
      expect(pair.connectionType).toBe("within_document");
    }
  });

  test("skips self-matches from search results", async () => {
    const chunks = [
      makeChunk({ _id: "c1", documentId: "d1" }),
      makeChunk({ _id: "c2", documentId: "d2" }),
    ];

    // Track which seed chunk triggered each search call
    let searchCallIdx = 0;
    const seedOrder = ["c1", "c2"];

    const vectorStore = createMockVectorStore((_vector, _filter, _topK) => {
      const seedId = seedOrder[searchCallIdx % seedOrder.length];
      searchCallIdx++;
      // Only return the seed chunk itself as a match (self-match)
      return [
        {
          id: `vec-${seedId}`,
          score: 1.0,
          payload: {
            chunkId: seedId!,
            documentId: seedId === "c1" ? "d1" : "d2",
            chunkIndex: 0,
            userId: "user1",
          },
        },
      ];
    });

    const result = await discoverConnections({
      allChunks: chunks,
      userId: "user1",
      embedder: createMockEmbedder(),
      vectorStore,
      fetchContent: mockFetchContent(chunks),
      maxPairs: 3,
      randomFn: () => 0.1,
    });

    // All results are self-matches, so no valid pairs
    expect(result).toEqual([]);
  });

  test("filters out matches below similarity threshold", async () => {
    const chunks = [
      makeChunk({ _id: "c1", documentId: "d1" }),
      makeChunk({ _id: "c2", documentId: "d2" }),
    ];

    const vectorStore = createMockVectorStore((_vector, _filter, _topK) => {
      return [
        {
          id: "vec-c2",
          score: 0.5, // Below default 0.82 threshold
          payload: { chunkId: "c2", documentId: "d2", chunkIndex: 0, userId: "user1" },
        },
      ];
    });

    const result = await discoverConnections({
      allChunks: chunks,
      userId: "user1",
      embedder: createMockEmbedder(),
      vectorStore,
      fetchContent: mockFetchContent(chunks),
      maxPairs: 3,
      randomFn: () => 0.1,
    });

    expect(result).toEqual([]);
  });

  test("respects maxPairs limit", async () => {
    const chunks = [
      makeChunk({ _id: "c1", documentId: "d1" }),
      makeChunk({ _id: "c2", documentId: "d2" }),
      makeChunk({ _id: "c3", documentId: "d3" }),
    ];

    const vectorStore = createMockVectorStore((_vector, _filter, _topK) => {
      return [
        {
          id: "vec-c2",
          score: 0.95,
          payload: { chunkId: "c2", documentId: "d2", chunkIndex: 0, userId: "user1" },
        },
        {
          id: "vec-c3",
          score: 0.9,
          payload: { chunkId: "c3", documentId: "d3", chunkIndex: 0, userId: "user1" },
        },
      ];
    });

    const result = await discoverConnections({
      allChunks: chunks,
      userId: "user1",
      embedder: createMockEmbedder(),
      vectorStore,
      fetchContent: mockFetchContent(chunks),
      maxPairs: 1,
      randomFn: () => 0.1,
    });

    expect(result).toHaveLength(1);
  });

  test("deduplicates pairs found from different seed chunks", async () => {
    const chunks = [
      makeChunk({ _id: "c1", documentId: "d1" }),
      makeChunk({ _id: "c2", documentId: "d2" }),
    ];

    let callCount = 0;
    const vectorStore = createMockVectorStore((_vector, _filter, _topK) => {
      callCount++;
      // Both seeds find the same pair
      if (callCount === 1) {
        return [
          {
            id: "vec-c2",
            score: 0.9,
            payload: { chunkId: "c2", documentId: "d2", chunkIndex: 0, userId: "user1" },
          },
        ];
      }
      return [
        {
          id: "vec-c1",
          score: 0.92,
          payload: { chunkId: "c1", documentId: "d1", chunkIndex: 0, userId: "user1" },
        },
      ];
    });

    const result = await discoverConnections({
      allChunks: chunks,
      userId: "user1",
      embedder: createMockEmbedder(),
      vectorStore,
      fetchContent: mockFetchContent(chunks),
      maxPairs: 5,
      randomFn: () => 0.1,
    });

    // Should be deduplicated to 1 pair, with the higher score
    expect(result).toHaveLength(1);
    expect(result[0]!.similarityScore).toBe(0.92);
  });

  test("skips within-document chunks that are too close together", async () => {
    // Single document - within-doc mode
    const chunks = [
      makeChunk({ _id: "c1", documentId: "d1" }),
      makeChunk({ _id: "c2", documentId: "d1" }),
      makeChunk({ _id: "c3", documentId: "d1" }),
    ];

    const vectorStore = createMockVectorStore((_vector, _filter, _topK) => {
      // c2 is adjacent to c1 (index distance = 1)
      return [
        {
          id: "vec-c2",
          score: 0.95,
          payload: { chunkId: "c2", documentId: "d1", chunkIndex: 1, userId: "user1" },
        },
      ];
    });

    const result = await discoverConnections({
      allChunks: chunks,
      userId: "user1",
      embedder: createMockEmbedder(),
      vectorStore,
      fetchContent: mockFetchContent(chunks),
      maxPairs: 3,
      randomFn: () => 0.1,
    });

    // Adjacent chunks should be filtered out (MIN_CHUNK_INDEX_DISTANCE = 3)
    expect(result).toEqual([]);
  });

  test("sorts results by similarity score descending", async () => {
    const chunks = [
      makeChunk({ _id: "c1", documentId: "d1" }),
      makeChunk({ _id: "c2", documentId: "d2" }),
      makeChunk({ _id: "c3", documentId: "d3" }),
    ];

    const vectorStore = createMockVectorStore((_vector, _filter, _topK) => {
      return [
        {
          id: "vec-c2",
          score: 0.85,
          payload: { chunkId: "c2", documentId: "d2", chunkIndex: 0, userId: "user1" },
        },
        {
          id: "vec-c3",
          score: 0.95,
          payload: { chunkId: "c3", documentId: "d3", chunkIndex: 0, userId: "user1" },
        },
      ];
    });

    const result = await discoverConnections({
      allChunks: chunks,
      userId: "user1",
      embedder: createMockEmbedder(),
      vectorStore,
      fetchContent: mockFetchContent(chunks),
      maxPairs: 5,
      randomFn: () => 0.1,
    });

    if (result.length >= 2) {
      expect(result[0]!.similarityScore).toBeGreaterThanOrEqual(result[1]!.similarityScore);
    }
  });

  test("uses configurable similarity threshold", async () => {
    const chunks = [
      makeChunk({ _id: "c1", documentId: "d1" }),
      makeChunk({ _id: "c2", documentId: "d2" }),
    ];

    const vectorStore = createMockVectorStore((_vector, _filter, _topK) => {
      return [
        {
          id: "vec-c2",
          score: 0.75, // Below default 0.82 but above custom 0.70
          payload: { chunkId: "c2", documentId: "d2", chunkIndex: 0, userId: "user1" },
        },
      ];
    });

    const noResult = await discoverConnections({
      allChunks: chunks,
      userId: "user1",
      embedder: createMockEmbedder(),
      vectorStore,
      fetchContent: mockFetchContent(chunks),
      maxPairs: 3,
      similarityThreshold: 0.8,
      randomFn: () => 0.1,
    });
    expect(noResult).toEqual([]);

    const withResult = await discoverConnections({
      allChunks: chunks,
      userId: "user1",
      embedder: createMockEmbedder(),
      vectorStore,
      fetchContent: mockFetchContent(chunks),
      maxPairs: 3,
      similarityThreshold: 0.7,
      randomFn: () => 0.1,
    });
    expect(withResult).toHaveLength(1);
  });
});
