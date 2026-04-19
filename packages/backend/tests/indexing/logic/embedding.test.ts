import { describe, expect, it, vi } from "vitest";

import { embedBatchLogic } from "../../../src/indexing/logic/embedding";
import { createMockEmbeddingServices, createMockEmbedder, createMockVectorStore } from "./mocks";

function makeChunk(
  overrides?: Partial<{ _id: string; content: string; chunkIndex: number; embedded: boolean }>,
) {
  return {
    _id: "chunk1",
    content: "test content",
    chunkIndex: 0,
    embedded: false,
    ...overrides,
  };
}

const fakeIdToUuid = (id: string) => `uuid-${id}`;

describe("embedBatchLogic", () => {
  it("embeds valid chunks, builds points with correct IDs, and upserts", async () => {
    const upsertFn = vi.fn();
    const services = createMockEmbeddingServices({
      embedder: createMockEmbedder({
        dimensions: 2,
        lastUsage: { tokens: 10 },
        embed: vi.fn().mockResolvedValue([
          [0.1, 0.2],
          [0.3, 0.4],
        ]),
      }),
      vectorStore: createMockVectorStore({ upsert: upsertFn }),
    });

    const result = await embedBatchLogic({
      input: {
        chunks: [makeChunk({ _id: "c1", chunkIndex: 0 }), makeChunk({ _id: "c2", chunkIndex: 1 })],
        documentId: "doc1",
        userId: "user1",
        idToUuid: fakeIdToUuid,
      },
      services,
    });

    expect(result.points).toHaveLength(2);
    expect(result.points[0]!.id).toBe("uuid-c1");
    expect(result.points[0]!.payload.chunkId).toBe("c1");
    expect(result.points[0]!.payload.documentId).toBe("doc1");
    expect(result.points[0]!.payload.userId).toBe("user1");
    expect(result.points[1]!.id).toBe("uuid-c2");

    expect(result.embeddedChunks).toEqual([
      { chunkId: "c1", embeddingId: "uuid-c1" },
      { chunkId: "c2", embeddingId: "uuid-c2" },
    ]);

    expect(result.embeddingUsage).toEqual({ tokens: 10 });
    expect(result.metrics.validChunkCount).toBe(2);

    expect(upsertFn).toHaveBeenCalledWith(result.points);
  });

  it("filters out already-embedded chunks", async () => {
    const services = createMockEmbeddingServices({
      embedder: {
        dimensions: 2,
        lastUsage: { tokens: 5 },
        embed: vi.fn().mockResolvedValue([[0.1, 0.2]]),
      },
    });

    const result = await embedBatchLogic({
      input: {
        chunks: [
          makeChunk({ _id: "c1", embedded: true }),
          makeChunk({ _id: "c2", embedded: false }),
        ],
        documentId: "doc1",
        userId: "user1",
        idToUuid: fakeIdToUuid,
      },
      services,
    });

    expect(result.points).toHaveLength(1);
    expect(result.embeddedChunks).toHaveLength(1);
    expect(result.embeddedChunks[0]!.chunkId).toBe("c2");
    expect(result.metrics.validChunkCount).toBe(1);
  });

  it("returns empty result when all chunks are already embedded", async () => {
    const embedFn = vi.fn();
    const upsertFn = vi.fn();
    const services = createMockEmbeddingServices({
      embedder: createMockEmbedder({ embed: embedFn }),
      vectorStore: createMockVectorStore({ upsert: upsertFn }),
    });

    const result = await embedBatchLogic({
      input: {
        chunks: [
          makeChunk({ _id: "c1", embedded: true }),
          makeChunk({ _id: "c2", embedded: true }),
        ],
        documentId: "doc1",
        userId: "user1",
        idToUuid: fakeIdToUuid,
      },
      services,
    });

    expect(result.points).toEqual([]);
    expect(result.embeddedChunks).toEqual([]);
    expect(result.metrics.validChunkCount).toBe(0);
    expect(result.metrics.embedDurationMs).toBe(0);
    expect(result.metrics.upsertDurationMs).toBe(0);
    expect(embedFn).not.toHaveBeenCalled();
    expect(upsertFn).not.toHaveBeenCalled();
  });

  it("returns empty result for empty chunks array", async () => {
    const services = createMockEmbeddingServices();

    const result = await embedBatchLogic({
      input: {
        chunks: [],
        documentId: "doc1",
        userId: "user1",
        idToUuid: fakeIdToUuid,
      },
      services,
    });

    expect(result.points).toEqual([]);
    expect(result.embeddedChunks).toEqual([]);
    expect(result.metrics.validChunkCount).toBe(0);
  });
});
