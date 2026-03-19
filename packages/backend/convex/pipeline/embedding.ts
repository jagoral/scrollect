"use node";

import { v } from "convex/values";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { internalAction } from "../_generated/server";
import { WideEvent } from "../lib/logging";
import { captureAiUsage, captureEvent } from "../providers/analytics";

import {
  convexIdToUuid,
  createEmbeddingProvider,
  createVectorStore,
  EMBED_BATCH_SIZE,
  MAX_EMBED_RETRIES,
} from "./helpers";

export async function fanOutEmbedding(
  ctx: ActionCtx,
  documentId: Id<"documents">,
  chunkIds: Id<"chunks">[],
) {
  if (chunkIds.length === 0) {
    await ctx.runMutation(internal.documents.updateStatus, {
      id: documentId,
      status: "ready",
      chunkCount: 0,
    });
    return;
  }

  const totalBatches = Math.ceil(chunkIds.length / EMBED_BATCH_SIZE);
  const jobId = await ctx.runMutation(internal.processingJobs.create, {
    documentId,
    totalBatches,
  });

  for (let i = 0; i < chunkIds.length; i += EMBED_BATCH_SIZE) {
    const batchChunkIds = chunkIds.slice(i, i + EMBED_BATCH_SIZE);
    await ctx.scheduler.runAfter(0, internal.pipeline.embedding.embedBatch, {
      jobId,
      documentId,
      chunkIds: batchChunkIds,
      retryCount: 0,
    });
  }
}

export const embedBatch = internalAction({
  args: {
    jobId: v.id("processingJobs"),
    documentId: v.id("documents"),
    chunkIds: v.array(v.id("chunks")),
    retryCount: v.number(),
  },
  handler: async (ctx, { jobId, documentId, chunkIds, retryCount }) => {
    const evt = new WideEvent("pipeline.embedBatch");
    evt.set({ jobId, documentId, chunkCount: chunkIds.length, retryCount });
    try {
      const embedder = createEmbeddingProvider();
      const vectorStore = createVectorStore();

      // Fetch chunk contents
      const chunks = await Promise.all(
        chunkIds.map((id) => ctx.runQuery(internal.chunks.getInternal, { id })),
      );

      // Get document for userId
      const doc = await ctx.runQuery(internal.documents.getInternal, { id: documentId });
      if (!doc) throw new Error(`Document ${documentId} not found`);
      if (doc.status === "deleting") return;

      const validChunks = chunks.filter(
        (c): c is NonNullable<typeof c> => c !== null && !c.embedded,
      );

      evt.set("validChunkCount", validChunks.length);

      if (validChunks.length === 0) {
        // All chunks already embedded — mark batch complete
        const job = await ctx.runMutation(internal.processingJobs.markBatchComplete, {
          id: jobId,
          failed: false,
        });
        await checkCompletion(ctx, job, documentId);
        return;
      }

      const texts = validChunks.map((c) => c.content);

      const t0 = Date.now();
      const vectors = await embedder.embed(texts);
      evt.set("embedDurationMs", Date.now() - t0);
      if (embedder.lastUsage) {
        captureAiUsage({
          distinctId: doc.userId,
          operation: "embedding",
          documentId,
          usage: embedder.lastUsage,
          model: "embedding",
        });
      }

      // Build vector points with deterministic UUIDs derived from chunk IDs
      const points = validChunks.map((chunk, i) => ({
        id: convexIdToUuid(chunk._id),
        vector: vectors[i],
        payload: {
          chunkId: chunk._id as string,
          documentId: documentId as string,
          chunkIndex: chunk.chunkIndex,
          userId: doc.userId,
        },
      }));

      const t1 = Date.now();
      await vectorStore.upsert(points);
      evt.set("upsertDurationMs", Date.now() - t1);

      // Mark all chunks as embedded in a single batched mutation
      const t2 = Date.now();
      await ctx.runMutation(internal.chunks.markEmbeddedBatch, {
        chunks: validChunks.map((chunk) => ({
          chunkId: chunk._id,
          embeddingId: convexIdToUuid(chunk._id),
        })),
      });
      evt.set("markEmbeddedDurationMs", Date.now() - t2);

      // Mark batch complete and check fan-in
      const job = await ctx.runMutation(internal.processingJobs.markBatchComplete, {
        id: jobId,
        failed: false,
      });
      await checkCompletion(ctx, job, documentId);
    } catch (error) {
      evt.setError(error);

      if (retryCount < MAX_EMBED_RETRIES) {
        const delayMs = Math.pow(2, retryCount) * 1000;
        await ctx.scheduler.runAfter(delayMs, internal.pipeline.embedding.embedBatch, {
          jobId,
          documentId,
          chunkIds,
          retryCount: retryCount + 1,
        });
        return;
      }

      // Retries exhausted
      const errorMessage = error instanceof Error ? error.message : String(error);
      const job = await ctx.runMutation(internal.processingJobs.markBatchComplete, {
        id: jobId,
        failed: true,
      });
      await checkCompletion(ctx, job, documentId, errorMessage);
    } finally {
      evt.emit();
    }
  },
});

async function checkCompletion(
  ctx: ActionCtx,
  job: { totalBatches: number; completedBatches: number; failedBatches: number },
  documentId: Id<"documents">,
  lastError?: string,
) {
  if (job.completedBatches + job.failedBatches < job.totalBatches) {
    return;
  }

  const doc = await ctx.runQuery(internal.documents.getInternal, { id: documentId });

  if (job.failedBatches > 0) {
    const summary = `${job.failedBatches}/${job.totalBatches} embedding batches failed`;
    const errorMessage = lastError ? `${summary}: ${lastError}` : summary;
    if (doc) {
      captureEvent({
        distinctId: doc.userId,
        event: "pipeline.stage_failed",
        properties: {
          stage: "embedding",
          document_id: documentId,
          total_batches: job.totalBatches,
          failed_batches: job.failedBatches,
          error: errorMessage,
        },
      });
    }
    await ctx.runMutation(internal.documents.updateStatus, {
      id: documentId,
      status: "error",
      errorMessage,
      failedAt: "embedding",
    });
  } else {
    if (doc) {
      captureEvent({
        distinctId: doc.userId,
        event: "pipeline.stage_completed",
        properties: {
          stage: "embedding",
          document_id: documentId,
          total_batches: job.totalBatches,
          chunk_count: doc.chunkCount ?? 0,
        },
      });
    }
    await ctx.runMutation(internal.documents.updateStatus, {
      id: documentId,
      status: "summarizing",
    });
    await ctx.scheduler.runAfter(0, internal.pipeline.summarizing.summarizeDocument, {
      documentId,
    });
  }
}
