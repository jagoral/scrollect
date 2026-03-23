"use node";

import { v } from "convex/values";

import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { WideEvent } from "../lib/logging";
import { captureAiUsage, captureEvent } from "../providers/analytics";

import { suggestTagsLogic } from "./logic/tagging";
import { createTaggingServiceContext } from "./services";

export const autoSuggest = internalAction({
  args: {
    documentId: v.id("documents"),
  },
  handler: async (ctx, { documentId }) => {
    const evt = new WideEvent("pipeline.autoSuggestTags");
    evt.set({ documentId });
    let doc:
      | Awaited<ReturnType<typeof ctx.runQuery<typeof internal.documents.getInternal>>>
      | undefined;
    try {
      doc = await ctx.runQuery(internal.documents.getInternal, { id: documentId });
      if (!doc) throw new Error(`Document ${documentId} not found`);
      if (doc.status === "deleting") return;

      evt.set("userId", doc.userId);

      if (doc.tagSources?.includes("ai")) {
        evt.set("skipped", "already has AI tags");
        return;
      }

      const allChunks = await ctx.runQuery(internal.chunks.listByDocumentInternal, {
        documentId,
      });
      evt.set("totalChunks", allChunks.length);

      if (allChunks.length === 0) {
        evt.set("skipped", "no chunks");
        return;
      }

      const services = createTaggingServiceContext();
      const {
        tags: validTags,
        usage,
        metrics,
      } = await suggestTagsLogic({
        input: { chunks: allChunks },
        services,
      });

      evt.set({
        sampledChunks: metrics.sampledChunks,
        suggestedTags: metrics.suggestedTags,
      });

      for (const tagName of validTags) {
        await ctx.runMutation(internal.tags.addTagToDocumentInternal, {
          documentId,
          userId: doc.userId,
          name: tagName,
          source: "ai",
        });
      }

      evt.set("storedTags", validTags.length);

      await captureAiUsage({
        distinctId: doc.userId,
        operation: "tagging",
        documentId,
        usage,
        modelType: "llm",
      });
      await captureEvent({
        distinctId: doc.userId,
        event: "pipeline.stage_completed",
        properties: {
          stage: "tagging",
          document_id: documentId,
          tag_count: validTags.length,
        },
      });
    } catch (error) {
      evt.setError(error);
      await captureEvent({
        distinctId: doc?.userId ?? `unresolved:${documentId}`,
        event: "pipeline.stage_failed",
        properties: {
          stage: "tagging",
          document_id: documentId,
          error: error instanceof Error ? error.message : String(error),
        },
      });
    } finally {
      evt.emit();
    }
  },
});
