"use node";

import { v } from "convex/values";

import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { WideEvent } from "../../src/platform/logging";

/**
 * Regenerate drafts for a user by re-running draft generation for all ready documents.
 * Triggered by the feed serving mutation when pending draft count drops below threshold.
 */
export const regenerateDrafts = internalAction({
  args: { userId: v.string() },
  returns: v.null(),
  handler: async (ctx, { userId }) => {
    const evt = new WideEvent("pipeline.regenerateDrafts");
    evt.set({ userId });

    try {
      const documents = await ctx.runQuery(internal.feed.queries.listReadyDocuments, { userId });
      evt.set("documentCount", documents.length);

      for (const doc of documents) {
        await ctx.scheduler.runAfter(
          0,
          internal.pipeline.cardDraftGeneration.generateDraftsForDocument,
          { documentId: doc._id, mode: "replenishment" },
        );
      }
    } catch (error) {
      evt.setError(error);
    } finally {
      evt.emit();
    }

    return null;
  },
});
