import { describe, expect, it, vi } from "vitest";

import { deleteDocumentVectors } from "../documentDeletion";
import { createMockVectorDeletionServices } from "./mocks";

describe("deleteDocumentVectors", () => {
  it("deletes chunk and summary vectors from both stores", async () => {
    const vectorDeleteFn = vi.fn();
    const summaryDeleteFn = vi.fn();
    const services = createMockVectorDeletionServices({
      vectorStore: {
        ensureCollection: async () => {},
        upsert: async () => {},
        search: async () => [],
        searchExcludingDocument: async () => [],
        delete: vectorDeleteFn,
      },
      summaryStore: {
        ensureCollection: async () => {},
        upsert: async () => {},
        search: async () => [],
        delete: summaryDeleteFn,
      },
    });

    const result = await deleteDocumentVectors({
      input: {
        chunkEmbeddingIds: ["chunk-vec-1", "chunk-vec-2"],
        sectionSummaryEmbeddingIds: ["section-vec-1"],
        documentSummaryEmbeddingId: "doc-vec-1",
      },
      services,
    });

    expect(result.deletedChunkVectorCount).toBe(2);
    expect(result.deletedSummaryVectorCount).toBe(2);

    expect(vectorDeleteFn).toHaveBeenCalledWith(["chunk-vec-1", "chunk-vec-2"]);
    expect(summaryDeleteFn).toHaveBeenCalledWith(["section-vec-1", "doc-vec-1"]);
  });

  it("handles empty embedding ID lists", async () => {
    const vectorDeleteFn = vi.fn();
    const summaryDeleteFn = vi.fn();
    const services = createMockVectorDeletionServices({
      vectorStore: {
        ensureCollection: async () => {},
        upsert: async () => {},
        search: async () => [],
        searchExcludingDocument: async () => [],
        delete: vectorDeleteFn,
      },
      summaryStore: {
        ensureCollection: async () => {},
        upsert: async () => {},
        search: async () => [],
        delete: summaryDeleteFn,
      },
    });

    const result = await deleteDocumentVectors({
      input: {
        chunkEmbeddingIds: [],
        sectionSummaryEmbeddingIds: [],
      },
      services,
    });

    expect(result.deletedChunkVectorCount).toBe(0);
    expect(result.deletedSummaryVectorCount).toBe(0);

    expect(vectorDeleteFn).toHaveBeenCalledWith([]);
    expect(summaryDeleteFn).toHaveBeenCalledWith([]);
  });

  it("excludes document summary embedding when not provided", async () => {
    const summaryDeleteFn = vi.fn();
    const services = createMockVectorDeletionServices({
      summaryStore: {
        ensureCollection: async () => {},
        upsert: async () => {},
        search: async () => [],
        delete: summaryDeleteFn,
      },
    });

    const result = await deleteDocumentVectors({
      input: {
        chunkEmbeddingIds: ["chunk-vec-1"],
        sectionSummaryEmbeddingIds: ["section-vec-1", "section-vec-2"],
      },
      services,
    });

    expect(result.deletedChunkVectorCount).toBe(1);
    expect(result.deletedSummaryVectorCount).toBe(2);

    expect(summaryDeleteFn).toHaveBeenCalledWith(["section-vec-1", "section-vec-2"]);
  });

  it("calls both stores in parallel", async () => {
    const callOrder: string[] = [];
    const services = createMockVectorDeletionServices({
      vectorStore: {
        ensureCollection: async () => {},
        upsert: async () => {},
        search: async () => [],
        searchExcludingDocument: async () => [],
        delete: async () => {
          callOrder.push("vector");
        },
      },
      summaryStore: {
        ensureCollection: async () => {},
        upsert: async () => {},
        search: async () => [],
        delete: async () => {
          callOrder.push("summary");
        },
      },
    });

    await deleteDocumentVectors({
      input: {
        chunkEmbeddingIds: ["c1"],
        sectionSummaryEmbeddingIds: ["s1"],
      },
      services,
    });

    expect(callOrder).toContain("vector");
    expect(callOrder).toContain("summary");
  });
});
