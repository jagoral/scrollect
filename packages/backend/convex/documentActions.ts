"use node";

import { v } from "convex/values";

import { internal } from "./_generated/api";
import { action } from "./_generated/server";
import { requireAuth } from "./lib/functions";
import { WideEvent } from "./lib/logging";
import { createSummaryVectorStore, createVectorStore } from "./pipeline/helpers";

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

      if (!data) {
        throw new Error("Document not found");
      }

      if (data.document.userId !== user._id) {
        throw new Error("Document not found");
      }

      await ctx.runMutation(internal.documents.updateStatus, {
        id: args.documentId,
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

      const vectorStore = createVectorStore();
      const summaryVectorStore = createSummaryVectorStore();

      await Promise.all([
        vectorStore.delete(data.chunkEmbeddingIds),
        summaryVectorStore.delete(summaryVectorIds),
      ]);

      const postResult = await ctx.runMutation(internal.documents.cascadeDeletePosts, {
        documentId: args.documentId,
        userId: user._id,
      });

      const chunkResult = await ctx.runMutation(
        internal.documents.cascadeDeleteChunksAndSummaries,
        { documentId: args.documentId },
      );

      const docResult = await ctx.runMutation(internal.documents.cascadeDeleteDocument, {
        documentId: args.documentId,
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
    } catch (error) {
      evt.setError(error);
      throw error;
    } finally {
      evt.emit();
    }

    return null;
  },
});
