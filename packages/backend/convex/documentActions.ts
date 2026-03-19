"use node";

import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";
import { action, internalAction } from "./_generated/server";
import { requireAuth } from "./lib/functions";
import { WideEvent } from "./lib/logging";
import { createSummaryVectorStore, createVectorStore } from "./pipeline/helpers";

type DeletionData = {
  document: {
    _id: Id<"documents">;
    userId: string;
    storageId?: Id<"_storage">;
    summaryEmbeddingId?: string;
  };
  chunkEmbeddingIds: string[];
  sectionSummaryEmbeddingIds: string[];
};

async function executeDeletionCascade(
  ctx: ActionCtx,
  {
    documentId,
    userId,
    data,
    evt,
  }: {
    documentId: Id<"documents">;
    userId: string;
    data: DeletionData;
    evt: WideEvent;
  },
) {
  await ctx.runMutation(internal.documents.updateStatus, {
    id: documentId,
    status: "deleting",
  });

  const summaryVectorIds = [
    ...data.sectionSummaryEmbeddingIds,
    ...(data.document.summaryEmbeddingId ? [data.document.summaryEmbeddingId] : []),
  ];

  evt.set({
    chunkVectorCount: data.chunkEmbeddingIds.length,
    summaryVectorCount: summaryVectorIds.length,
  });

  // Vector store deletes are idempotent — Qdrant silently ignores missing IDs,
  // making retries safe even after partial completion.
  const vectorStore = createVectorStore();
  const summaryVectorStore = createSummaryVectorStore();

  await Promise.all([
    vectorStore.delete(data.chunkEmbeddingIds),
    summaryVectorStore.delete(summaryVectorIds),
  ]);

  const postResult = await ctx.runMutation(internal.documents.cascadeDeletePosts, {
    documentId,
    userId,
  });

  const chunkResult = await ctx.runMutation(internal.documents.cascadeDeleteChunksAndSummaries, {
    documentId,
  });

  const docResult = await ctx.runMutation(internal.documents.cascadeDeleteDocument, {
    documentId,
  });

  evt.set({
    deleted: {
      posts: postResult.deletedPosts,
      postSources: postResult.deletedPostSources,
      bookmarks: postResult.deletedBookmarks,
      chunks: chunkResult.deletedChunks,
      sectionSummaries: chunkResult.deletedSectionSummaries,
      processingJobs: chunkResult.deletedProcessingJobs,
      orphanedTags: docResult.deletedOrphanedTags,
    },
  });
}

async function setDeletionErrorStatus(
  ctx: ActionCtx,
  {
    documentId,
    error,
    evt,
  }: {
    documentId: Id<"documents">;
    error: unknown;
    evt: WideEvent;
  },
) {
  try {
    await ctx.runMutation(internal.documents.updateStatus, {
      id: documentId,
      status: "error",
      failedAt: "deleting",
      errorMessage: error instanceof Error ? error.message : "Unknown error",
    });
  } catch (recoveryError) {
    // Recovery may fail if cascadeDeleteDocument already deleted the document row.
    // This is expected — the document is gone, so there's nothing to mark as errored.
    evt.set("recoveryError", String(recoveryError));
  }
}

export const deleteDocument = action({
  args: { documentId: v.id("documents") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const evt = new WideEvent("documentActions.deleteDocument");
    evt.set({ documentId: args.documentId });

    try {
      const user = await requireAuth(ctx);
      evt.set("userId", user._id);

      const data = await ctx.runQuery(internal.documents.getDocumentDeletionData, {
        documentId: args.documentId,
      });

      if (!data || data.document.userId !== user._id) {
        throw new Error("Document not found");
      }

      await executeDeletionCascade(ctx, {
        documentId: args.documentId,
        userId: user._id,
        data,
        evt,
      });
    } catch (error) {
      evt.setError(error);
      await setDeletionErrorStatus(ctx, { documentId: args.documentId, error, evt });
      throw error;
    } finally {
      evt.emit();
    }

    return null;
  },
});

// Ownership was validated by the original deleteDocument call. This internal action
// is only reachable via resumeProcessing (scheduler) and trusts that the documentId
// refers to a legitimately user-owned document that previously failed deletion.
export const retryDeleteDocument = internalAction({
  args: { documentId: v.id("documents") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const evt = new WideEvent("documentActions.retryDeleteDocument");
    evt.set({ documentId: args.documentId });

    try {
      const data = await ctx.runQuery(internal.documents.getDocumentDeletionData, {
        documentId: args.documentId,
      });

      if (!data) {
        throw new Error("Document not found");
      }

      await executeDeletionCascade(ctx, {
        documentId: args.documentId,
        userId: data.document.userId,
        data,
        evt,
      });
    } catch (error) {
      evt.setError(error);
      await setDeletionErrorStatus(ctx, { documentId: args.documentId, error, evt });
      throw error;
    } finally {
      evt.emit();
    }

    return null;
  },
});
