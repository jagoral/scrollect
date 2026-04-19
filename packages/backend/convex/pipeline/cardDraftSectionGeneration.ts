"use node";

import { v } from "convex/values";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { internalAction } from "../_generated/server";
import { WideEvent } from "../lib/logging";
import { draftCardType } from "../lib/validators";
import type { DraftCardType, TokenUsage } from "../../src/providers/types";
import { captureAiUsage } from "../../src/providers/analytics";

import { computeContentHash } from "./helpers";
import { generateDraftsForSection } from "../../src/pipeline/logic/cardDraftGeneration";
import { checkCardDraftGenerationCompletion } from "./cardDraftCompletion";
import { createDraftGenerationServiceContext } from "./services";

const MAX_DRAFT_RETRIES = 3;
const LEARNING_GOAL_CHECK_DELAY_MS = 5000;

export const generateDraftsForSectionBatch = internalAction({
  args: {
    jobId: v.id("processingJobs"),
    documentId: v.id("documents"),
    sectionSummaryId: v.id("sectionSummaries"),
    cardTypes: v.array(draftCardType),
    generationBatch: v.number(),
    sectionQualitySignal: v.optional(v.number()),
    mode: v.union(v.literal("initial"), v.literal("replenishment")),
    retryCount: v.number(),
  },
  returns: v.null(),
  handler: async (
    ctx,
    {
      jobId,
      documentId,
      sectionSummaryId,
      cardTypes,
      generationBatch,
      sectionQualitySignal,
      mode,
      retryCount,
    },
  ) => {
    const evt = new WideEvent("pipeline.generateDraftsForSectionBatch");
    evt.set({
      jobId,
      documentId,
      sectionSummaryId,
      cardTypes,
      generationBatch,
      sectionQualitySignal,
      mode,
      retryCount,
    });
    let tokenUsage: TokenUsage | undefined;
    let userId: string | undefined;
    try {
      const doc = await ctx.runQuery(internal.documents.getInternal, { id: documentId });
      if (!doc) throw new Error(`Document ${documentId} not found`);
      if (doc.status === "deleting") return;
      if (doc.learningGoalOnboardingStatus === "pending") {
        evt.set("learningGoalPending", true);
        await ctx.scheduler.runAfter(
          LEARNING_GOAL_CHECK_DELAY_MS,
          internal.pipeline.cardDraftSectionGeneration.generateDraftsForSectionBatch,
          {
            jobId,
            documentId,
            sectionSummaryId,
            cardTypes,
            generationBatch,
            sectionQualitySignal,
            mode,
            retryCount,
          },
        );
        return;
      }
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

      const existingDrafts = await ctx.runQuery(internal.cardDrafts.listByDocument, {
        documentId,
      });
      const existingHashes = new Set(existingDrafts.map((draft) => draft.contentHash));

      const services = createDraftGenerationServiceContext();
      const result = await generateDraftsForSection({
        input: {
          documentId: documentId as string,
          userId: doc.userId,
          documentTitle: doc.title,
          language: doc.language,
          fileType: doc.fileType,
          learningGoal: doc.learningGoal,
          section: {
            sectionSummaryId: sectionSummaryId as string,
            sectionTitle: section.sectionTitle,
            summary: section.summary,
            chunkStartIndex: section.chunkStartIndex,
            chunkEndIndex: section.chunkEndIndex,
          },
          sectionQualitySignal,
          allChunks: chunkData,
          cardTypes: cardTypes as DraftCardType[],
          generationBatch,
          contextDepth: "full",
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
          drafts: result.drafts.map((draft) => ({
            documentId: draft.documentId as Id<"documents">,
            sectionSummaryId: draft.sectionSummaryId as Id<"sectionSummaries">,
            cardType: draft.cardType,
            content: draft.content,
            typeData: draft.typeData,
            sourceChunkIds: draft.sourceChunkIds as Id<"chunks">[],
            contentHash: draft.contentHash,
            qualityScore: draft.qualityScore,
            semanticQualityScore: draft.semanticQualityScore,
            sectionQualitySignal: draft.sectionQualitySignal,
            generationBatch: draft.generationBatch,
            strategy: draft.strategy,
          })),
        });
      }

      const job = await ctx.runMutation(internal.processingJobs.markBatchComplete, {
        id: jobId,
        failed: false,
      });
      await checkCardDraftGenerationCompletion({
        ctx,
        job,
        documentId,
        userId: doc.userId,
        evt,
        mode,
        generationBatch,
      });
    } catch (error) {
      evt.setError(error);

      if (retryCount < MAX_DRAFT_RETRIES) {
        const delayMs = Math.pow(2, retryCount) * 1000;
        await ctx.scheduler.runAfter(
          delayMs,
          internal.pipeline.cardDraftSectionGeneration.generateDraftsForSectionBatch,
          {
            jobId,
            documentId,
            sectionSummaryId,
            cardTypes,
            generationBatch,
            sectionQualitySignal,
            mode,
            retryCount: retryCount + 1,
          },
        );
        return;
      }

      const job = await ctx.runMutation(internal.processingJobs.markBatchComplete, {
        id: jobId,
        failed: true,
      });
      await checkCardDraftGenerationCompletion({
        ctx,
        job,
        documentId,
        userId: undefined,
        evt,
        lastError: error,
        mode,
        generationBatch,
      });
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
