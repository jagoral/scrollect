import { describe, expect, it, vi } from "vitest";

import { deleteDocumentVectors } from "../documentDeletion";
import type { DocumentVectorDeletionInput } from "../documentDeletion";
import { createMockVectorDeletionServices } from "./mocks";
import { createMockVectorStore, createMockSummaryStore } from "./mocks";

describe("deleteDocumentVectors (account deletion scenarios)", () => {
  it("deletes chunk and summary vectors for a single document", async () => {
    const vectorDelete = vi.fn().mockResolvedValue(undefined);
    const summaryDelete = vi.fn().mockResolvedValue(undefined);
    const services = createMockVectorDeletionServices({
      vectorStore: createMockVectorStore({ delete: vectorDelete }),
      summaryStore: createMockSummaryStore({ delete: summaryDelete }),
    });

    const input: DocumentVectorDeletionInput = {
      chunkEmbeddingIds: ["chunk-1", "chunk-2"],
      sectionSummaryEmbeddingIds: ["section-1"],
      documentSummaryEmbeddingId: "doc-summary-1",
    };

    const result = await deleteDocumentVectors({ input, services });

    expect(vectorDelete).toHaveBeenCalledWith(["chunk-1", "chunk-2"]);
    expect(summaryDelete).toHaveBeenCalledWith(["section-1", "doc-summary-1"]);
    expect(result.deletedChunkVectorCount).toBe(2);
    expect(result.deletedSummaryVectorCount).toBe(2);
  });

  it("excludes documentSummaryEmbeddingId when not present", async () => {
    const summaryDelete = vi.fn().mockResolvedValue(undefined);
    const services = createMockVectorDeletionServices({
      summaryStore: createMockSummaryStore({ delete: summaryDelete }),
    });

    const input: DocumentVectorDeletionInput = {
      chunkEmbeddingIds: ["chunk-1"],
      sectionSummaryEmbeddingIds: ["section-1", "section-2"],
    };

    const result = await deleteDocumentVectors({ input, services });

    expect(summaryDelete).toHaveBeenCalledWith(["section-1", "section-2"]);
    expect(result.deletedSummaryVectorCount).toBe(2);
  });

  it("handles empty embedding ID lists", async () => {
    const vectorDelete = vi.fn().mockResolvedValue(undefined);
    const summaryDelete = vi.fn().mockResolvedValue(undefined);
    const services = createMockVectorDeletionServices({
      vectorStore: createMockVectorStore({ delete: vectorDelete }),
      summaryStore: createMockSummaryStore({ delete: summaryDelete }),
    });

    const result = await deleteDocumentVectors({
      input: { chunkEmbeddingIds: [], sectionSummaryEmbeddingIds: [] },
      services,
    });

    expect(vectorDelete).toHaveBeenCalledWith([]);
    expect(summaryDelete).toHaveBeenCalledWith([]);
    expect(result.deletedChunkVectorCount).toBe(0);
    expect(result.deletedSummaryVectorCount).toBe(0);
  });

  it("calls both stores in parallel via Promise.all", async () => {
    const callOrder: string[] = [];
    const vectorDelete = vi.fn().mockImplementation(async () => {
      callOrder.push("vector-start");
      await new Promise((r) => setTimeout(r, 10));
      callOrder.push("vector-end");
    });
    const summaryDelete = vi.fn().mockImplementation(async () => {
      callOrder.push("summary-start");
      await new Promise((r) => setTimeout(r, 10));
      callOrder.push("summary-end");
    });
    const services = createMockVectorDeletionServices({
      vectorStore: createMockVectorStore({ delete: vectorDelete }),
      summaryStore: createMockSummaryStore({ delete: summaryDelete }),
    });

    await deleteDocumentVectors({
      input: {
        chunkEmbeddingIds: ["chunk-1"],
        sectionSummaryEmbeddingIds: ["section-1"],
        documentSummaryEmbeddingId: "doc-1",
      },
      services,
    });

    expect(callOrder[0]).toBe("vector-start");
    expect(callOrder[1]).toBe("summary-start");
  });
});
