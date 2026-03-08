"use node";

import { v } from "convex/values";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { internalAction } from "../_generated/server";
import { chunkMarkdown } from "../chunking";
import { WideEvent } from "../lib/logging";

import { fanOutEmbedding } from "./embedding";
import { CHUNK_STORE_BATCH_SIZE, fetchMarkdownBlob } from "./helpers";

export const chunkAndStore = internalAction({
  args: {
    documentId: v.id("documents"),
    markdownStorageId: v.id("_storage"),
  },
  handler: async (ctx, { documentId, markdownStorageId }) => {
    const evt = new WideEvent("pipeline.chunkAndStore");
    evt.set({ documentId, markdownStorageId });
    try {
      const markdown = await fetchMarkdownBlob(ctx, markdownStorageId);
      evt.set("markdownLength", markdown.length);

      await ctx.runMutation(internal.documents.updateStatus, {
        id: documentId,
        status: "chunking",
      });

      const rawChunks = chunkMarkdown(markdown);
      const chunks = rawChunks.map((c, i) => ({
        content: c.content,
        chunkIndex: i,
        tokenCount: c.tokenCount,
      }));

      evt.set("chunkCount", chunks.length);

      const allChunkIds: Id<"chunks">[] = [];
      let batchesStored = 0;
      for (let i = 0; i < chunks.length; i += CHUNK_STORE_BATCH_SIZE) {
        const batch = chunks.slice(i, i + CHUNK_STORE_BATCH_SIZE);
        const ids = await ctx.runMutation(internal.chunks.createBatch, {
          documentId,
          chunks: batch,
        });
        allChunkIds.push(...ids);
        batchesStored++;
      }
      evt.set("batchesStored", batchesStored);

      await ctx.runMutation(internal.documents.updateStatus, {
        id: documentId,
        status: "embedding",
        chunkCount: chunks.length,
      });

      // Fan-out embedding batches
      await fanOutEmbedding(ctx, documentId, allChunkIds);
    } catch (error) {
      evt.setError(error);
      const message = error instanceof Error ? error.message : "Chunking failed";
      await ctx.runMutation(internal.documents.updateStatus, {
        id: documentId,
        status: "error",
        errorMessage: message,
        failedAt: "chunking",
      });
    } finally {
      evt.emit();
    }
  },
});
