"use node";

import { v } from "convex/values";

import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { WideEvent } from "../lib/logging";

import { fetchAndParseMarkdownImpl, submitPdfParsingImpl } from "./parsing";

// --- Entry Point ---

export const startProcessing = internalAction({
  args: { documentId: v.id("documents") },
  handler: async (ctx, { documentId }) => {
    const evt = new WideEvent("pipeline.startProcessing");
    evt.set({ documentId });
    try {
      const doc = await ctx.runQuery(internal.documents.getInternal, { id: documentId });
      if (!doc) throw new Error(`Document ${documentId} not found`);

      evt.set({ fileType: doc.fileType, userId: doc.userId });

      if (doc.fileType === "pdf") {
        evt.set("path", "pdf");
        await ctx.runMutation(internal.documents.updateStatus, {
          id: documentId,
          status: "parsing",
        });
        await submitPdfParsingImpl(ctx, documentId, doc.storageId, evt);
      } else {
        evt.set("path", "markdown");
        await ctx.runMutation(internal.documents.updateStatus, {
          id: documentId,
          status: "parsing",
        });
        await fetchAndParseMarkdownImpl(ctx, documentId, doc.storageId, evt);
      }
    } catch (error) {
      evt.setError(error);
      throw error;
    } finally {
      evt.emit();
    }
  },
});
