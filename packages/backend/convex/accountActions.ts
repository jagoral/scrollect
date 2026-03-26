"use node";

import { v } from "convex/values";

import { components, internal } from "./_generated/api";
import { action } from "./_generated/server";
import { requireAuth } from "./lib/functions";
import { WideEvent } from "./lib/logging";
import { deleteDocumentVectors } from "../src/logic/documentDeletion";
import { createVectorDeletionServices } from "./pipeline/services";

export const deleteAccount = action({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const evt = new WideEvent("accountActions.deleteAccount");

    try {
      const user = await requireAuth(ctx);
      evt.set("userId", user._id);

      const documentIds = await ctx.runQuery(internal.account.getUserDocumentIds, {
        userId: user._id,
      });
      evt.set("documentCount", documentIds.length);

      const services = createVectorDeletionServices();
      const failedDocuments: string[] = [];

      for (const documentId of documentIds) {
        try {
          const data = await ctx.runQuery(internal.documents.getDocumentDeletionData, {
            documentId,
          });
          if (!data) continue;
          if (data.document.userId !== user._id) continue;

          await deleteDocumentVectors({
            input: {
              chunkEmbeddingIds: data.chunkEmbeddingIds,
              sectionSummaryEmbeddingIds: data.sectionSummaryEmbeddingIds,
              documentSummaryEmbeddingId: data.document.summaryEmbeddingId,
            },
            services,
          });

          await ctx.runMutation(internal.documents.cascadeDeletePosts, {
            documentId,
            userId: user._id,
          });
          await ctx.runMutation(internal.documents.cascadeDeleteChunksAndSummaries, {
            documentId,
            userId: user._id,
          });
          await ctx.runMutation(internal.documents.cascadeDeleteDocument, {
            documentId,
          });
        } catch (error) {
          failedDocuments.push(documentId);
          evt.set("documentError", {
            documentId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      if (failedDocuments.length > 0) {
        evt.set("failedDocuments", failedDocuments);
      }

      const remainingResult = await ctx.runMutation(internal.account.deleteRemainingUserData, {
        userId: user._id,
      });
      evt.set("deletedRemaining", remainingResult);

      // Delete auth data directly via adapter to avoid mutation timeout.
      // Each call is a separate mutation, keeping them within the time limit.
      for (const model of ["session", "account", "twoFactor"] as const) {
        await ctx.runMutation(components.betterAuth.adapter.deleteMany, {
          input: { model, where: [{ field: "userId", value: user._id }] },
          paginationOpts: { cursor: null, numItems: 500 },
        });
      }

      await ctx.runMutation(components.betterAuth.adapter.deleteOne, {
        input: { model: "user", where: [{ field: "_id", value: user._id }] },
      });

      if (failedDocuments.length > 0) {
        throw new Error(
          `Account deleted but ${failedDocuments.length} document(s) failed to fully clean up`,
        );
      }
    } catch (error) {
      evt.setError(error);
      throw error;
    } finally {
      evt.emit();
    }

    return null;
  },
});
