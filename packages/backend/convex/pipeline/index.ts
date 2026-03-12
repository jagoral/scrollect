"use node";

import { v } from "convex/values";

import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { WideEvent } from "../lib/logging";

import { extractArticleImpl, extractYouTubeImpl } from "./extraction";
import { fetchAndParseMarkdownImpl, submitPdfParsingImpl } from "./parsing";

export const startProcessing = internalAction({
  args: { documentId: v.id("documents") },
  handler: async (ctx, { documentId }) => {
    const evt = new WideEvent("pipeline.startProcessing");
    evt.set({ documentId });
    try {
      const doc = await ctx.runQuery(internal.documents.getInternal, { id: documentId });
      if (!doc) throw new Error(`Document ${documentId} not found`);

      evt.set({ fileType: doc.fileType, userId: doc.userId });

      await ctx.runMutation(internal.documents.updateStatus, {
        id: documentId,
        status: "parsing",
      });

      switch (doc.fileType) {
        case "pdf":
          if (!doc.storageId) throw new Error("PDF document missing storageId");
          evt.set("path", "pdf");
          await submitPdfParsingImpl(ctx, documentId, doc.storageId, evt);
          break;

        case "md":
        case "text":
          if (!doc.storageId) throw new Error(`${doc.fileType} document missing storageId`);
          evt.set("path", "markdown");
          await fetchAndParseMarkdownImpl(ctx, documentId, doc.storageId, evt);
          break;

        case "article":
          if (!doc.sourceUrl) throw new Error("Article document missing sourceUrl");
          evt.set("path", "article");
          await extractArticleImpl(ctx, documentId, doc.sourceUrl, evt);
          break;

        case "youtube":
          if (!doc.sourceUrl) throw new Error("YouTube document missing sourceUrl");
          evt.set("path", "youtube");
          await extractYouTubeImpl(ctx, documentId, doc.sourceUrl, evt);
          break;

        default:
          throw new Error(`Unsupported file type: ${doc.fileType}`);
      }
    } catch (error) {
      evt.setError(error);
      throw error;
    } finally {
      evt.emit();
    }
  },
});
