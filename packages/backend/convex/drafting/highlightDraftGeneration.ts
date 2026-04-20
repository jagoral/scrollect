"use node";

import { v } from "convex/values";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { internalAction } from "../_generated/server";
import { WideEvent } from "../../src/platform/logging";
import type { TokenUsage } from "../../src/providers/types";
import { captureAiUsage, captureEvent } from "../../src/providers/analytics/posthog";

import { computeContentHash } from "../../src/platform/contentHash";
import { generateHighlightDrafts } from "../../src/drafting/logic/highlightDraftGeneration";
import { createHighlightDraftGenerationServiceContext } from "./services";

const BATCH_SIZE = 10;
const CHAIN_DELAY_MS = 5000;
const LEARNING_GOAL_CHECK_DELAY_MS = 5000;
const MAX_RETRIES = 3;

export const generateHighlightDraftsForDocument = internalAction({
  args: {
    documentId: v.id("documents"),
    userId: v.string(),
    batchNumber: v.number(),
    retryCount: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, { documentId, userId, batchNumber, retryCount }) => {
    const evt = new WideEvent("pipeline.generateHighlightDrafts");
    evt.set({ documentId, userId, batchNumber, retryCount });
    const startMs = Date.now();
    let tokenUsage: TokenUsage | undefined;

    try {
      const doc = await ctx.runQuery(internal.content.documents.getInternal, { id: documentId });
      if (!doc) throw new Error(`Document ${documentId} not found`);
      if (doc.status === "deleting") {
        evt.set("exitReason", "document_deleting");
        return;
      }
      if (doc.learningGoalOnboardingStatus === "pending") {
        evt.set("learningGoalPending", true);
        await ctx.scheduler.runAfter(
          LEARNING_GOAL_CHECK_DELAY_MS,
          internal.drafting.highlightDraftGeneration.generateHighlightDraftsForDocument,
          {
            documentId,
            userId,
            batchNumber,
            retryCount,
          },
        );
        return;
      }

      const highlights = await ctx.runQuery(internal.content.highlights.listUnprocessedByDocument, {
        documentId,
        limit: BATCH_SIZE,
      });

      if (highlights.length === 0) {
        evt.set("exitReason", "no_unprocessed_highlights");
        await captureEvent({
          distinctId: userId,
          event: "highlight_draft_generation_completed",
          properties: {
            document_id: documentId,
            total_batches: batchNumber,
            duration_ms: Date.now() - startMs,
          },
        });
        return;
      }

      const sections = await ctx.runQuery(internal.content.sectionSummaries.listByDocument, {
        documentId,
      });

      if (sections.length === 0) {
        evt.set("exitReason", "no_section_summaries");
        await ctx.runMutation(internal.content.highlights.markDraftGenerated, {
          highlightIds: highlights.map((h) => h._id),
        });
        return;
      }

      const allChunks = await ctx.runQuery(internal.content.chunks.listByDocumentInternal, {
        documentId,
      });

      const existingDrafts = await ctx.runQuery(internal.drafting.postDrafts.listByDocumentStatus, {
        documentId,
        status: "pending",
      });
      const existingHashes = new Set(existingDrafts.map((d) => d.contentHash));

      const services = createHighlightDraftGenerationServiceContext();
      const result = await generateHighlightDrafts({
        input: {
          documentId: documentId as string,
          userId,
          documentTitle: doc.title,
          language: doc.language,
          learningGoal: doc.learningGoal,
          highlights: highlights.map((h) => ({
            _id: h._id as string,
            text: h.text,
            pageNumber: h.pageNumber,
          })),
          sections: sections.map((s) => ({
            _id: s._id as string,
            sectionTitle: s.sectionTitle,
            summary: s.summary,
            chunkStartIndex: s.chunkStartIndex,
            chunkEndIndex: s.chunkEndIndex,
          })),
          allChunks: allChunks.map((c) => ({
            _id: c._id as string,
            content: c.content,
            chunkIndex: c.chunkIndex,
          })),
          existingHashes,
          hashContent: computeContentHash,
          generationBatch: batchNumber,
        },
        services,
      });

      tokenUsage = result.tokenUsage;
      evt.set(result.metrics);

      if (result.drafts.length > 0) {
        const docCheck = await ctx.runQuery(internal.content.documents.getInternal, {
          id: documentId,
        });
        if (docCheck && docCheck.status !== "deleting") {
          await ctx.runMutation(internal.drafting.postDrafts.createBatch, {
            userId,
            drafts: result.drafts.map((d) => ({
              documentId: d.documentId as Id<"documents">,
              sectionSummaryId: d.sectionSummaryId as Id<"sectionSummaries"> | undefined,
              postType: d.postType,
              content: d.content,
              typeData: d.typeData,
              sourceChunkIds: d.sourceChunkIds as Id<"chunks">[],
              contentHash: d.contentHash,
              qualityScore: d.qualityScore,
              semanticQualityScore: d.semanticQualityScore,
              generationBatch: d.generationBatch,
              strategy: d.strategy,
            })),
          });
        }
      }

      if (result.processedHighlightIds.length > 0) {
        await ctx.runMutation(internal.content.highlights.markDraftGenerated, {
          highlightIds: result.processedHighlightIds as Id<"highlights">[],
        });
      }

      await captureEvent({
        distinctId: userId,
        event: "highlight_draft_batch_completed",
        properties: {
          document_id: documentId,
          batch_number: batchNumber,
          highlights_in_batch: result.metrics.highlightsInBatch,
          highlights_matched: result.metrics.highlightsMatched,
          sections_affected: result.metrics.sectionsAffected,
          drafts_produced: result.metrics.draftsProduced,
          duration_ms: Date.now() - startMs,
        },
      });

      await ctx.scheduler.runAfter(
        CHAIN_DELAY_MS,
        internal.drafting.highlightDraftGeneration.generateHighlightDraftsForDocument,
        {
          documentId,
          userId,
          batchNumber: batchNumber + 1,
          retryCount: 0,
        },
      );
    } catch (error) {
      evt.setError(error);

      if (retryCount < MAX_RETRIES) {
        const delayMs = Math.pow(2, retryCount) * 1000;
        await ctx.scheduler.runAfter(
          delayMs,
          internal.drafting.highlightDraftGeneration.generateHighlightDraftsForDocument,
          {
            documentId,
            userId,
            batchNumber,
            retryCount: retryCount + 1,
          },
        );
        return;
      }

      const failedHighlights = await ctx.runQuery(
        internal.content.highlights.listUnprocessedByDocument,
        {
          documentId,
          limit: BATCH_SIZE,
        },
      );
      if (failedHighlights.length > 0) {
        await ctx.runMutation(internal.content.highlights.markDraftGenerated, {
          highlightIds: failedHighlights.map((h) => h._id),
        });
      }

      await captureEvent({
        distinctId: userId,
        event: "pipeline.stage_failed",
        properties: {
          stage: "highlight_draft_generation",
          document_id: documentId,
          batch_number: batchNumber,
          error: error instanceof Error ? error.message : "Unknown error",
          duration_ms: Date.now() - startMs,
        },
      });

      await ctx.scheduler.runAfter(
        CHAIN_DELAY_MS,
        internal.drafting.highlightDraftGeneration.generateHighlightDraftsForDocument,
        {
          documentId,
          userId,
          batchNumber: batchNumber + 1,
          retryCount: 0,
        },
      );
    } finally {
      if (tokenUsage && tokenUsage.totalTokens > 0) {
        await captureAiUsage({
          distinctId: userId,
          operation: "highlight_draft_generation",
          documentId,
          usage: tokenUsage,
          model: tokenUsage.modelId!,
        });
      }
      evt.emit();
    }
  },
});
