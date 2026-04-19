import { describe, expect, it, vi } from "vitest";

import type { Id } from "../../convex/_generated/dataModel";
import { executeDocumentDeletionCascade } from "../../convex/content/deletion";
import { createMockSummaryStore, createMockVectorStore } from "./mocks";

describe("executeDocumentDeletionCascade", () => {
  it("runs the full document-owned cascade including highlights and connection pairs", async () => {
    const runMutation = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ deletedHighlights: 2 })
      .mockResolvedValueOnce({ deletedPosts: 3, deletedBookmarks: 4 })
      .mockResolvedValueOnce({ deletedConnectionPairs: 5 })
      .mockResolvedValueOnce({
        deletedChunks: 6,
        deletedSectionSummaries: 7,
        deletedProcessingJobs: 8,
        deletedCardDrafts: 9,
        deletedReactionFeedback: 10,
      })
      .mockResolvedValueOnce({ deletedOrphanedTags: 11 });
    const vectorDelete = vi.fn();
    const summaryDelete = vi.fn();
    const documentId = "doc-1" as Id<"documents">;
    const userId = "user-1";

    const result = await executeDocumentDeletionCascade({
      ctx: { runMutation: runMutation as never },
      documentId,
      userId,
      data: {
        document: {
          _id: documentId,
          userId,
          summaryEmbeddingId: "doc-summary-vec",
        },
        chunkEmbeddingIds: ["chunk-vec"],
        sectionSummaryEmbeddingIds: ["section-vec"],
      },
      services: {
        vectorStore: createMockVectorStore({ delete: vectorDelete }),
        summaryStore: createMockSummaryStore({ delete: summaryDelete }),
      },
    });

    expect(vectorDelete).toHaveBeenCalledWith(["chunk-vec"]);
    expect(summaryDelete).toHaveBeenCalledWith(["section-vec", "doc-summary-vec"]);
    expect(runMutation).toHaveBeenCalledTimes(6);
    expect(runMutation.mock.calls[0]?.[1]).toEqual({ id: documentId, status: "deleting" });
    expect(runMutation.mock.calls[1]?.[1]).toEqual({ documentId, userId });
    expect(runMutation.mock.calls[3]?.[1]).toEqual({ documentId });
    expect(result).toEqual({
      chunkVectorCount: 1,
      summaryVectorCount: 2,
      deleted: {
        highlights: 2,
        posts: 3,
        bookmarks: 4,
        connectionPairs: 5,
        chunks: 6,
        sectionSummaries: 7,
        processingJobs: 8,
        cardDrafts: 9,
        reactionFeedback: 10,
        orphanedTags: 11,
      },
    });
  });

  it("deletes vectors before deleting Convex rows", async () => {
    const order: string[] = [];
    const runMutation = vi.fn().mockImplementation(async () => {
      order.push("mutation");
      return {
        deletedHighlights: 0,
        deletedPosts: 0,
        deletedBookmarks: 0,
        deletedConnectionPairs: 0,
        deletedChunks: 0,
        deletedSectionSummaries: 0,
        deletedProcessingJobs: 0,
        deletedCardDrafts: 0,
        deletedReactionFeedback: 0,
        deletedOrphanedTags: 0,
      };
    });
    const documentId = "doc-1" as Id<"documents">;
    const userId = "user-1";

    await executeDocumentDeletionCascade({
      ctx: { runMutation: runMutation as never },
      documentId,
      userId,
      data: {
        document: { _id: documentId, userId },
        chunkEmbeddingIds: ["chunk-vec"],
        sectionSummaryEmbeddingIds: [],
      },
      services: {
        vectorStore: createMockVectorStore({
          delete: async () => {
            order.push("vector-delete");
          },
        }),
        summaryStore: createMockSummaryStore({
          delete: async () => {
            order.push("summary-delete");
          },
        }),
      },
    });

    expect(order).toEqual([
      "mutation",
      "vector-delete",
      "summary-delete",
      "mutation",
      "mutation",
      "mutation",
      "mutation",
      "mutation",
    ]);
  });
});
