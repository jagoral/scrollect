"use node";

import { v } from "convex/values";

import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { WideEvent } from "../lib/logging";

import { fanOutEmbedding } from "./embedding";

// --- Resumability ---

export const resumeProcessing = internalAction({
  args: { documentId: v.id("documents") },
  handler: async (ctx, { documentId }) => {
    const evt = new WideEvent("pipeline.resumeProcessing");
    evt.set({ documentId });
    try {
      const doc = await ctx.runQuery(internal.documents.getInternal, { id: documentId });
      if (!doc) throw new Error(`Document ${documentId} not found`);
      if (doc.status !== "error") return;

      evt.set("failedAt", doc.failedAt);

      switch (doc.failedAt) {
        case "parsing":
          if (doc.datalabCheckUrl) {
            evt.set("resumePath", "pollDatalabResult");
            // Resume polling from saved checkpoint
            await ctx.runMutation(internal.documents.updateStatus, {
              id: documentId,
              status: "parsing",
            });
            await ctx.scheduler.runAfter(0, internal.pipeline.parsing.pollDatalabResult, {
              documentId,
              checkUrl: doc.datalabCheckUrl,
              attempt: 0,
              startedAt: Date.now(),
            });
          } else {
            evt.set("resumePath", "startProcessing");
            // Re-start processing from scratch
            await ctx.scheduler.runAfter(0, internal.pipeline.index.startProcessing, {
              documentId,
            });
          }
          break;

        case "chunking": {
          const allChunks = await ctx.runQuery(internal.chunks.listByDocumentInternal, {
            documentId,
          });
          if (allChunks.length > 0) {
            evt.set("resumePath", "embedUnembeddedChunks");
            // Chunks exist — skip to embedding
            await ctx.runMutation(internal.documents.updateStatus, {
              id: documentId,
              status: "embedding",
            });
            await ctx.scheduler.runAfter(0, internal.pipeline.resume.embedUnembeddedChunks, {
              documentId,
            });
          } else {
            evt.set("resumePath", "startProcessing");
            // No chunks — re-start from scratch
            await ctx.scheduler.runAfter(0, internal.pipeline.index.startProcessing, {
              documentId,
            });
          }
          break;
        }

        case "embedding":
          evt.set("resumePath", "embedUnembeddedChunks");
          await ctx.runMutation(internal.documents.updateStatus, {
            id: documentId,
            status: "embedding",
          });
          await ctx.scheduler.runAfter(0, internal.pipeline.resume.embedUnembeddedChunks, {
            documentId,
          });
          break;

        default:
          evt.set("resumePath", "startProcessing");
          // No failedAt — restart from scratch
          await ctx.scheduler.runAfter(0, internal.pipeline.index.startProcessing, {
            documentId,
          });
          break;
      }
    } catch (error) {
      evt.setError(error);
      throw error;
    } finally {
      evt.emit();
    }
  },
});

export const embedUnembeddedChunks = internalAction({
  args: { documentId: v.id("documents") },
  handler: async (ctx, { documentId }) => {
    const evt = new WideEvent("pipeline.embedUnembeddedChunks");
    evt.set({ documentId });
    try {
      const unembedded = await ctx.runQuery(internal.chunks.listUnembedded, {
        documentId,
      });

      evt.set("unembeddedCount", unembedded.length);

      if (unembedded.length === 0) {
        // All chunks already embedded
        const allChunks = await ctx.runQuery(internal.chunks.listByDocumentInternal, {
          documentId,
        });
        await ctx.runMutation(internal.documents.updateStatus, {
          id: documentId,
          status: "ready",
          chunkCount: allChunks.length,
        });
        return;
      }

      const chunkIds = unembedded.map((c) => c._id);
      await fanOutEmbedding(ctx, documentId, chunkIds);
    } catch (error) {
      evt.setError(error);
      throw error;
    } finally {
      evt.emit();
    }
  },
});
