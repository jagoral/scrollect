"use node";

import { v } from "convex/values";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { internalAction } from "../_generated/server";
import { WideEvent } from "../lib/logging";
import { captureAiUsage, captureEvent } from "../../src/providers/analytics";
import { addUsage, type TokenUsage } from "../../src/providers/ai";

import { computeContentHash, transitionToReady } from "./helpers";
import {
  discoverThemes,
  generateThematicDrafts,
} from "../../src/pipeline/logic/thematicDraftGeneration";
import { createThematicDraftGenerationServiceContext } from "./services";

const LEARNING_GOAL_CHECK_DELAY_MS = 5000;

export const generateThematicDraftsForDocument = internalAction({
  args: { documentId: v.id("documents") },
  returns: v.null(),
  handler: async (ctx, { documentId }) => {
    const evt = new WideEvent("pipeline.generateThematicDrafts");
    evt.set({ documentId });
    const startMs = Date.now();
    let tokenUsage: TokenUsage | undefined;
    let userId: string | undefined;

    try {
      const doc = await ctx.runQuery(internal.documents.getInternal, { id: documentId });
      if (!doc) throw new Error(`Document ${documentId} not found`);
      if (doc.status === "deleting") {
        await transitionToReady({ ctx, documentId, userId: doc.userId, evt });
        return;
      }
      if (doc.learningGoalOnboardingStatus === "pending") {
        evt.set("learningGoalPending", true);
        await ctx.scheduler.runAfter(
          LEARNING_GOAL_CHECK_DELAY_MS,
          internal.pipeline.thematicDraftGeneration.generateThematicDraftsForDocument,
          { documentId },
        );
        return;
      }
      userId = doc.userId;
      evt.set("userId", userId);

      const sections = await ctx.runQuery(internal.sectionSummaries.listByDocument, {
        documentId,
      });
      const sectionSummaries = sections.map((s) => ({
        sectionTitle: s.sectionTitle,
        summary: s.summary,
      }));
      evt.set("sectionCount", sections.length);

      const services = createThematicDraftGenerationServiceContext();

      const discoveryResult = await discoverThemes({
        input: {
          sectionSummaries,
          documentTitle: doc.title,
          language: doc.language,
          learningGoal: doc.learningGoal,
        },
        services,
      });
      tokenUsage = discoveryResult.usage;
      evt.set("themesDiscovered", discoveryResult.themes.length);

      if (discoveryResult.themes.length === 0) {
        await transitionToReady({ ctx, documentId, userId, evt });
        return;
      }

      const allChunks = await ctx.runQuery(internal.chunks.listByDocumentInternal, {
        documentId,
      });
      const chunkContentMap = new Map(allChunks.map((c) => [c._id as string, c.content]));

      const existingDrafts = await ctx.runQuery(internal.cardDrafts.listByDocumentStatus, {
        documentId,
        status: "pending",
      });
      const existingHashes = new Set(existingDrafts.map((d) => d.contentHash));

      const result = await generateThematicDrafts({
        input: {
          documentId: documentId as string,
          userId,
          documentTitle: doc.title,
          language: doc.language,
          fileType: doc.fileType,
          learningGoal: doc.learningGoal,
          themes: discoveryResult.themes,
          sectionSummaries,
          chunkContentMap,
          existingHashes,
          hashContent: computeContentHash,
        },
        services,
      });

      tokenUsage = addUsage(tokenUsage, result.tokenUsage);
      evt.set(result.metrics);

      if (result.drafts.length > 0) {
        const docCheck = await ctx.runQuery(internal.documents.getInternal, { id: documentId });
        if (docCheck && docCheck.status !== "deleting") {
          await ctx.runMutation(internal.cardDrafts.createBatch, {
            userId,
            drafts: result.drafts.map((d) => ({
              documentId: d.documentId as Id<"documents">,
              sectionSummaryId: d.sectionSummaryId,
              cardType: d.cardType,
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

      if (userId) {
        await captureEvent({
          distinctId: userId,
          event: "pipeline.stage_completed",
          properties: {
            stage: "thematic_draft_generation",
            document_id: documentId,
            themes_discovered: discoveryResult.themes.length,
            drafts_generated: result.drafts.length,
            duration_ms: Date.now() - startMs,
          },
        });
      }

      await transitionToReady({ ctx, documentId, userId, evt });
    } catch (error) {
      evt.setError(error);
      await transitionToReady({ ctx, documentId, userId, evt });
    } finally {
      if (tokenUsage && tokenUsage.totalTokens > 0 && userId) {
        await captureAiUsage({
          distinctId: userId,
          operation: "thematic_draft_generation",
          documentId,
          usage: tokenUsage,
          model: tokenUsage.modelId!,
        });
      }
      evt.emit();
    }
  },
});
