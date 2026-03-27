"use node";

import { v } from "convex/values";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { internalAction } from "../_generated/server";
import { WideEvent } from "../lib/logging";
import type { TokenUsage } from "../../src/providers/types";
import { captureAiUsage, captureEvent } from "../../src/providers/analytics";

import { computeContentHash, transitionToReady } from "./helpers";
import { generateDraftsForSection } from "../../src/pipeline/logic/cardDraftGeneration";
import { createDraftGenerationServiceContext } from "./services";

const MAX_DRAFT_RETRIES = 3;
const MIN_SECTIONS_FOR_THEMATIC = 3;

export const generateDraftsForDocument = internalAction({
  args: { documentId: v.id("documents") },
  returns: v.null(),
  handler: async (ctx, { documentId }) => {
    const evt = new WideEvent("pipeline.generateDraftsForDocument");
    evt.set({ documentId });
    try {
      const doc = await ctx.runQuery(internal.documents.getInternal, { id: documentId });
      if (!doc) throw new Error(`Document ${documentId} not found`);
      if (doc.status === "deleting") return;

      evt.set("userId", doc.userId);

      const sections = await ctx.runQuery(internal.sectionSummaries.listByDocument, {
        documentId,
      });

      const contentSections = sections.filter((s) => s.isSubstantiveContent !== false);
      const noiseSections = sections.filter((s) => s.isSubstantiveContent === false);
      evt.set({
        totalSections: sections.length,
        noiseSectionsFiltered: noiseSections.length,
        noiseTitles: noiseSections.map((s) => s.sectionTitle),
      });

      if (contentSections.length === 0) {
        await transitionToReady({ ctx, documentId, userId: doc.userId, evt });
        return;
      }

      const totalBatches = contentSections.length;
      const jobId = await ctx.runMutation(internal.processingJobs.create, {
        documentId,
        totalBatches,
      });

      evt.set({ totalBatches, jobId });

      for (const section of contentSections) {
        await ctx.scheduler.runAfter(
          0,
          internal.pipeline.cardDraftGeneration.generateDraftsForSectionBatch,
          {
            jobId,
            documentId,
            sectionSummaryId: section._id,
            retryCount: 0,
          },
        );
      }
    } catch (error) {
      evt.setError(error);
      const message = error instanceof Error ? error.message : "Draft generation setup failed";
      await ctx.runMutation(internal.documents.updateStatus, {
        id: documentId,
        status: "error",
        errorMessage: message,
        failedAt: "generating_cards",
      });
      // Error is not re-thrown intentionally: the status mutation IS the complete
      // error handling. Convex dashboard won't show this as a failed function, but
      // the WideEvent and document status capture the failure for observability.
    } finally {
      evt.emit();
    }
  },
});

export const generateDraftsForSectionBatch = internalAction({
  args: {
    jobId: v.id("processingJobs"),
    documentId: v.id("documents"),
    sectionSummaryId: v.id("sectionSummaries"),
    retryCount: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, { jobId, documentId, sectionSummaryId, retryCount }) => {
    const evt = new WideEvent("pipeline.generateDraftsForSectionBatch");
    evt.set({ jobId, documentId, sectionSummaryId, retryCount });
    let tokenUsage: TokenUsage | undefined;
    let userId: string | undefined;
    try {
      const doc = await ctx.runQuery(internal.documents.getInternal, { id: documentId });
      if (!doc) throw new Error(`Document ${documentId} not found`);
      if (doc.status === "deleting") return;
      userId = doc.userId;

      const section = await ctx.runQuery(internal.sectionSummaries.getInternal, {
        id: sectionSummaryId,
      });
      if (!section) throw new Error(`Section ${sectionSummaryId} not found`);

      const sectionChunks = await ctx.runQuery(internal.chunks.listByDocumentRange, {
        documentId,
        startIndex: section.chunkStartIndex,
        endIndex: section.chunkEndIndex,
      });
      const chunkData = sectionChunks.map((c) => ({
        _id: c._id as string,
        content: c.content,
        chunkIndex: c.chunkIndex,
      }));

      const existingDrafts = await ctx.runQuery(internal.cardDrafts.listByDocumentStatus, {
        documentId,
        status: "pending",
      });
      const existingHashes = new Set(existingDrafts.map((d) => d.contentHash));

      const services = createDraftGenerationServiceContext();
      const result = await generateDraftsForSection({
        input: {
          documentId: documentId as string,
          userId: doc.userId,
          documentTitle: doc.title,
          language: doc.language,
          fileType: doc.fileType,
          section: {
            sectionSummaryId: sectionSummaryId as string,
            sectionTitle: section.sectionTitle,
            summary: section.summary,
            chunkStartIndex: section.chunkStartIndex,
            chunkEndIndex: section.chunkEndIndex,
          },
          allChunks: chunkData,
          existingHashes,
          hashContent: computeContentHash,
        },
        services,
      });

      tokenUsage = result.tokenUsage;
      evt.set(result.metrics);

      if (result.drafts.length > 0) {
        await ctx.runMutation(internal.cardDrafts.createBatch, {
          userId: doc.userId,
          drafts: result.drafts.map((d) => ({
            documentId: d.documentId as Id<"documents">,
            sectionSummaryId: d.sectionSummaryId as Id<"sectionSummaries">,
            cardType: d.cardType,
            content: d.content,
            typeData: d.typeData,
            sourceChunkIds: d.sourceChunkIds as Id<"chunks">[],
            contentHash: d.contentHash,
            qualityScore: d.qualityScore,
            generationBatch: d.generationBatch,
            strategy: d.strategy,
          })),
        });
      }

      const job = await ctx.runMutation(internal.processingJobs.markBatchComplete, {
        id: jobId,
        failed: false,
      });
      await checkCompletion({ ctx, job, documentId, userId: doc.userId, evt });
    } catch (error) {
      evt.setError(error);

      if (retryCount < MAX_DRAFT_RETRIES) {
        const delayMs = Math.pow(2, retryCount) * 1000;
        await ctx.scheduler.runAfter(
          delayMs,
          internal.pipeline.cardDraftGeneration.generateDraftsForSectionBatch,
          {
            jobId,
            documentId,
            sectionSummaryId,
            retryCount: retryCount + 1,
          },
        );
        return;
      }

      const job = await ctx.runMutation(internal.processingJobs.markBatchComplete, {
        id: jobId,
        failed: true,
      });
      await checkCompletion({ ctx, job, documentId, userId: undefined, evt, lastError: error });
    } finally {
      if (tokenUsage && tokenUsage.totalTokens > 0 && userId) {
        await captureAiUsage({
          distinctId: userId,
          operation: "card_draft_generation",
          documentId,
          usage: tokenUsage,
          model: tokenUsage.modelId!,
        });
      }
      evt.emit();
    }
  },
});

async function checkCompletion(opts: {
  ctx: ActionCtx;
  job: { totalBatches: number; completedBatches: number; failedBatches: number };
  documentId: Id<"documents">;
  userId: string | undefined;
  evt: WideEvent;
  lastError?: unknown;
}) {
  const { ctx, job, documentId, userId, evt, lastError } = opts;

  if (job.completedBatches + job.failedBatches < job.totalBatches) {
    return;
  }

  const resolvedUserId = userId ?? (await resolveUserId(ctx, documentId));

  if (job.failedBatches > 0 && job.completedBatches === 0) {
    const errorMessage =
      lastError instanceof Error
        ? `All ${job.failedBatches} draft generation batches failed: ${lastError.message}`
        : `All ${job.failedBatches}/${job.totalBatches} draft generation batches failed`;
    await ctx.runMutation(internal.documents.updateStatus, {
      id: documentId,
      status: "error",
      errorMessage,
      failedAt: "generating_cards",
    });
    if (resolvedUserId) {
      await captureEvent({
        distinctId: resolvedUserId,
        event: "pipeline.stage_failed",
        properties: {
          stage: "generating_cards",
          document_id: documentId,
          total_batches: job.totalBatches,
          failed_batches: job.failedBatches,
          error: errorMessage,
        },
      });
    }
    return;
  }

  if (job.failedBatches > 0) {
    evt.set("partialFailure", {
      failedBatches: job.failedBatches,
      totalBatches: job.totalBatches,
    });
    if (resolvedUserId) {
      await captureEvent({
        distinctId: resolvedUserId,
        event: "pipeline.stage_partial_failure",
        properties: {
          stage: "generating_cards",
          document_id: documentId,
          total_batches: job.totalBatches,
          failed_batches: job.failedBatches,
          completed_batches: job.completedBatches,
        },
      });
    }
  }

  if (job.totalBatches >= MIN_SECTIONS_FOR_THEMATIC && job.completedBatches > 0) {
    evt.set("schedulingThematicGeneration", true);
    await ctx.scheduler.runAfter(
      0,
      internal.pipeline.thematicDraftGeneration.generateThematicDraftsForDocument,
      { documentId },
    );
    return;
  }

  await transitionToReady({ ctx, documentId, userId: resolvedUserId, evt });
}

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
          { documentId: doc._id },
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

async function resolveUserId(
  ctx: ActionCtx,
  documentId: Id<"documents">,
): Promise<string | undefined> {
  const doc = await ctx.runQuery(internal.documents.getInternal, { id: documentId });
  return doc?.userId;
}
