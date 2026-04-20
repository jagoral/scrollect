"use node";

import { v } from "convex/values";

import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { WideEvent } from "../../src/platform/logging";
import { captureEvent } from "../../src/providers/analytics/posthog";

import { extractArticleImpl, extractYouTubeImpl } from "./extraction";
import { createMarkerClient } from "../../src/providers/wiring";
import { fetchAndParseMarkdownImpl, submitMarkerParsing } from "./parsing";

export const startProcessing = internalAction({
  args: { documentId: v.id("documents") },
  handler: async (ctx, { documentId }) => {
    const evt = new WideEvent("pipeline.startProcessing");
    evt.set({ documentId });
    try {
      const doc = await ctx.runQuery(internal.content.documents.getInternal, { id: documentId });
      if (!doc) throw new Error(`Document ${documentId} not found`);
      if (doc.status === "deleting") return;

      evt.set({ fileType: doc.fileType, userId: doc.userId });

      await ctx.runMutation(internal.content.documents.updateStatus, {
        id: documentId,
        status: "parsing",
      });

      await captureEvent({
        distinctId: doc.userId,
        event: "pipeline.processing_started",
        properties: { document_id: documentId, file_type: doc.fileType },
      });

      switch (doc.fileType) {
        case "pdf":
        case "epub":
          if (!doc.storageId)
            throw new Error(`${doc.fileType.toUpperCase()} document missing storageId`);
          evt.set("path", "marker");
          await submitMarkerParsing({
            ctx,
            documentId,
            storageId: doc.storageId,
            userId: doc.userId,
            fileType: doc.fileType,
            client: createMarkerClient(),
            evt,
          });
          break;

        case "md":
        case "text":
          if (!doc.storageId) throw new Error(`${doc.fileType} document missing storageId`);
          evt.set("path", "markdown");
          await fetchAndParseMarkdownImpl({
            ctx,
            documentId,
            storageId: doc.storageId,
            userId: doc.userId,
            fileType: doc.fileType,
            evt,
          });
          break;

        case "article":
          if (!doc.sourceUrl) throw new Error("Article document missing sourceUrl");
          evt.set("path", "article");
          await extractArticleImpl({
            ctx,
            documentId,
            sourceUrl: doc.sourceUrl,
            userId: doc.userId,
            fileType: doc.fileType,
            evt,
          });
          break;

        case "youtube":
          if (!doc.sourceUrl) throw new Error("YouTube document missing sourceUrl");
          evt.set("path", "youtube");
          await extractYouTubeImpl({
            ctx,
            documentId,
            sourceUrl: doc.sourceUrl,
            userId: doc.userId,
            fileType: doc.fileType,
            evt,
          });
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
