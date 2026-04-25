import { getFunctionName } from "convex/server";
import { describe, expect, it, vi } from "vitest";

import { internal } from "../../convex/_generated/api";
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
      .mockResolvedValueOnce({ deletedDocumentTopics: 12 })
      .mockResolvedValueOnce({
        deletedChunks: 6,
        deletedSectionSummaries: 7,
        deletedProcessingJobs: 8,
        deletedPostDrafts: 9,
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
    expect(runMutation).toHaveBeenCalledTimes(7);

    const callNames = runMutation.mock.calls.map((call) => getFunctionName(call?.[0]));
    expect(callNames[0]).toBe(getFunctionName(internal.content.documents.updateStatus));
    expect(runMutation.mock.calls[0]?.[1]).toEqual({ id: documentId, status: "deleting" });

    const parallelCalls = runMutation.mock.calls.slice(1, 5);
    const parallelNames = parallelCalls.map((call) => getFunctionName(call?.[0]));
    expect(parallelNames.sort()).toEqual(
      [
        getFunctionName(internal.content.highlights.cascadeDeleteHighlights),
        getFunctionName(internal.content.documents.cascadeDeletePosts),
        getFunctionName(internal.drafting.connectionPairs.cascadeDeleteByDocumentId),
        getFunctionName(internal.topics.topics.cascadeDeleteByDocumentId),
      ].sort(),
    );
    const callByName = new Map(
      parallelCalls.map((call) => [getFunctionName(call?.[0]), call?.[1]]),
    );
    expect(
      callByName.get(getFunctionName(internal.content.highlights.cascadeDeleteHighlights)),
    ).toEqual({
      documentId,
      userId,
    });
    expect(callByName.get(getFunctionName(internal.content.documents.cascadeDeletePosts))).toEqual({
      documentId,
      userId,
    });
    expect(
      callByName.get(getFunctionName(internal.drafting.connectionPairs.cascadeDeleteByDocumentId)),
    ).toEqual({
      documentId,
    });
    expect(
      callByName.get(getFunctionName(internal.topics.topics.cascadeDeleteByDocumentId)),
    ).toEqual({
      documentId,
    });

    expect(callNames[5]).toBe(
      getFunctionName(internal.content.documents.cascadeDeleteChunksAndSummaries),
    );
    expect(callNames[6]).toBe(getFunctionName(internal.content.documents.cascadeDeleteDocument));
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
        postDrafts: 9,
        reactionFeedback: 10,
        orphanedTags: 11,
        documentTopics: 12,
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
        deletedPostDrafts: 0,
        deletedReactionFeedback: 0,
        deletedOrphanedTags: 0,
        deletedDocumentTopics: 0,
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
      "mutation",
    ]);
  });
});
