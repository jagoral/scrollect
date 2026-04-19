import { describe, expect, it, vi } from "vitest";

import { deleteAccountDocuments } from "../../convex/access/accountActions";
import type { Id } from "../../convex/_generated/dataModel";
import { createMockSummaryStore, createMockVectorStore } from "./mocks";

function createEventRecorder() {
  const fields: Record<string, unknown> = {};
  return {
    fields,
    evt: {
      set: vi.fn((keyOrObj: string | Record<string, unknown>, value?: unknown) => {
        if (typeof keyOrObj === "string") {
          fields[keyOrObj] = value;
        } else {
          Object.assign(fields, keyOrObj);
        }
      }),
    },
  };
}

describe("deleteAccountDocuments", () => {
  it("delegates account document cleanup through the shared cascade", async () => {
    const documentId = "doc-1" as Id<"documents">;
    const userId = "user-1";
    const runQuery = vi.fn().mockResolvedValue({
      document: {
        _id: documentId,
        userId,
        summaryEmbeddingId: "doc-summary-vec",
      },
      chunkEmbeddingIds: ["chunk-vec"],
      sectionSummaryEmbeddingIds: ["section-vec"],
    });
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
        deletedPostDrafts: 9,
        deletedReactionFeedback: 10,
      })
      .mockResolvedValueOnce({ deletedOrphanedTags: 11 });
    const vectorDelete = vi.fn();
    const summaryDelete = vi.fn();
    const { evt } = createEventRecorder();

    const result = await deleteAccountDocuments({
      ctx: {
        runQuery: runQuery as never,
        runMutation: runMutation as never,
      },
      userId,
      documentIds: [documentId],
      evt,
      services: {
        vectorStore: createMockVectorStore({ delete: vectorDelete }),
        summaryStore: createMockSummaryStore({ delete: summaryDelete }),
      },
    });

    expect(result).toEqual({ deletedDocumentCount: 1, failedDocuments: [] });
    expect(vectorDelete).toHaveBeenCalledWith(["chunk-vec"]);
    expect(summaryDelete).toHaveBeenCalledWith(["section-vec", "doc-summary-vec"]);
    expect(runMutation).toHaveBeenCalledTimes(6);
    expect(runMutation.mock.calls[1]?.[1]).toEqual({ documentId, userId });
    expect(runMutation.mock.calls[3]?.[1]).toEqual({ documentId });
  });

  it("recovers failed cascades out of deleting status", async () => {
    const documentId = "doc-1" as Id<"documents">;
    const userId = "user-1";
    const runQuery = vi.fn().mockResolvedValue({
      document: { _id: documentId, userId },
      chunkEmbeddingIds: ["chunk-vec"],
      sectionSummaryEmbeddingIds: [],
    });
    const runMutation = vi.fn().mockResolvedValue(null);
    const { evt, fields } = createEventRecorder();

    const result = await deleteAccountDocuments({
      ctx: {
        runQuery: runQuery as never,
        runMutation: runMutation as never,
      },
      userId,
      documentIds: [documentId],
      evt,
      services: {
        vectorStore: createMockVectorStore({
          delete: async () => {
            throw new Error("vector delete failed");
          },
        }),
        summaryStore: createMockSummaryStore(),
      },
    });

    expect(result).toEqual({ deletedDocumentCount: 0, failedDocuments: [documentId] });
    expect(runMutation).toHaveBeenCalledTimes(2);
    expect(runMutation.mock.calls[0]?.[1]).toEqual({ id: documentId, status: "deleting" });
    expect(runMutation.mock.calls[1]?.[1]).toEqual({
      id: documentId,
      status: "error",
      failedAt: "deleting",
      errorMessage: "vector delete failed",
    });
    expect(fields.documentError).toEqual({
      documentId,
      error: "vector delete failed",
    });
  });
});
