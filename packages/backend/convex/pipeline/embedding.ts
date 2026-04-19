"use node";

import { v } from "convex/values";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { internalAction } from "../_generated/server";
import { WideEvent } from "../../src/platform/logging";
import { normalizeUsage } from "../../src/providers/llm/models";
import { captureAiUsage, captureEvent } from "../../src/providers/analytics/posthog";

import { convexIdToUuid, EMBED_BATCH_SIZE, MAX_EMBED_RETRIES } from "./helpers";
import { embedBatchLogic } from "../../src/indexing/logic/embedding";
import { createEmbeddingServiceContext } from "./services";

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
  returns: v.null(),
  handler: async (ctx, { jobId, documentId, chunkIds, retryCount }) => {
    const evt = new WideEvent("pipeline.embedBatch");
    evt.set({ jobId, documentId, chunkCount: chunkIds.length, retryCount });
    try {
      const chunks = await Promise.all(
        chunkIds.map((id) => ctx.runQuery(internal.chunks.getInternal, { id })),
      );

      const doc = await ctx.runQuery(internal.documents.getInternal, { id: documentId });
      if (!doc) throw new Error(`Document ${documentId} not found`);
      if (doc.status === "deleting") return;

      const validChunkData = chunks
        .filter((c): c is NonNullable<typeof c> => c !== null)
        .map((c) => ({
          _id: c._id as string,
          content: c.content,
          chunkIndex: c.chunkIndex,
          embedded: c.embedded,
        }));

      const services = createEmbeddingServiceContext();
      const result = await embedBatchLogic({
        input: {
          chunks: validChunkData,
          documentId: documentId as string,
          userId: doc.userId,
          idToUuid: convexIdToUuid,
        },
        services,
      });

      evt.set(result.metrics);

      if (result.embeddedChunks.length > 0) {
        await ctx.runMutation(internal.chunks.markEmbeddedBatch, {
          chunks: result.embeddedChunks.map((c) => ({
            chunkId: c.chunkId as Id<"chunks">,
            embeddingId: c.embeddingId,
          })),
        });
      }

      const job = await ctx.runMutation(internal.processingJobs.markBatchComplete, {
        id: jobId,
        failed: false,
      });
      await checkCompletion(ctx, job, documentId, evt);

      if (result.embeddingUsage) {
        await captureAiUsage({
          distinctId: doc.userId,
          operation: "embedding",
          documentId,
          usage: normalizeUsage(
            {
              inputTokens: result.embeddingUsage.tokens,
              totalTokens: result.embeddingUsage.tokens,
            },
            "embedding",
          ),
          model: "embedding",
        });
      }
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

      const errorMessage = error instanceof Error ? error.message : String(error);
      const job = await ctx.runMutation(internal.processingJobs.markBatchComplete, {
        id: jobId,
        failed: true,
      });
      await checkCompletion(ctx, job, documentId, evt, errorMessage);
    } finally {
      evt.emit();
    }
  },
});

async function checkCompletion(
  ctx: ActionCtx,
  job: { totalBatches: number; completedBatches: number; failedBatches: number },
  documentId: Id<"documents">,
  evt: WideEvent,
  lastError?: string,
) {
  if (job.completedBatches + job.failedBatches < job.totalBatches) {
    return;
  }

  const doc = await ctx.runQuery(internal.documents.getInternal, { id: documentId });

  if (job.failedBatches > 0) {
    const summary = `${job.failedBatches}/${job.totalBatches} embedding batches failed`;
    const errorMessage = lastError ? `${summary}: ${lastError}` : summary;
    await ctx.runMutation(internal.documents.updateStatus, {
      id: documentId,
      status: "error",
      errorMessage,
      failedAt: "embedding",
    });
    if (doc) {
      await captureEvent({
        distinctId: doc.userId,
        event: "pipeline.stage_failed",
        properties: {
          stage: "embedding",
          document_id: documentId,
          total_batches: job.totalBatches,
          failed_batches: job.failedBatches,
          error: errorMessage,
          duration_ms: evt.getElapsedMs(),
        },
      });
    }
  } else {
    await ctx.runMutation(internal.documents.updateStatus, {
      id: documentId,
      status: "summarizing",
    });
    await ctx.scheduler.runAfter(0, internal.pipeline.summarizing.summarizeDocument, {
      documentId,
    });
    if (doc) {
      await captureEvent({
        distinctId: doc.userId,
        event: "pipeline.stage_completed",
        properties: {
          stage: "embedding",
          document_id: documentId,
          total_batches: job.totalBatches,
          chunk_count: doc.chunkCount ?? 0,
          duration_ms: evt.getElapsedMs(),
        },
      });
    }
  }
}
