"use node";

import { v } from "convex/values";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { internalAction } from "../_generated/server";
import { WideEvent } from "../../src/platform/logging";
import { captureAiUsage } from "../../src/providers/analytics/posthog";

import { transitionToReady } from "../indexing/readyTransition";
import { planDraftGeneration } from "../../src/drafting/logic/draftGenerationPlan";
import {
  buildDraftPlanningSections,
  countDraftsBySection,
  getNextGenerationBatch,
} from "../../src/drafting/logic/draftGenerationPreparation";
import { rankSectionsForPlanning } from "../../src/drafting/logic/draftSectionRanking";
import { captureDraftSetupFailure, captureNoDraftsPlanned } from "./postDraftAnalytics";
import { createDraftGenerationServiceContext } from "./services";

const LEARNING_GOAL_CHECK_DELAY_MS = 5000;

export const generateDraftsForDocument = internalAction({
  args: {
    documentId: v.id("documents"),
    mode: v.optional(v.union(v.literal("initial"), v.literal("replenishment"))),
  },
  returns: v.null(),
  handler: async (ctx, { documentId, mode = "initial" }) => {
    const evt = new WideEvent("pipeline.generateDraftsForDocument");
    let userId: string | undefined;
    evt.set({ documentId, mode });
    try {
      const doc = await ctx.runQuery(internal.content.documents.getInternal, { id: documentId });
      if (!doc) throw new Error(`Document ${documentId} not found`);
      if (doc.status === "deleting") return;
      userId = doc.userId;
      if (doc.learningGoalOnboardingStatus === "pending") {
        evt.set("learningGoalPending", true);
        await ctx.scheduler.runAfter(
          LEARNING_GOAL_CHECK_DELAY_MS,
          internal.drafting.postDraftGeneration.generateDraftsForDocument,
          { documentId, mode },
        );
        return;
      }

      evt.set("userId", doc.userId);

      const sections = await ctx.runQuery(internal.content.sectionSummaries.listByDocument, {
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
        if (mode === "initial") {
          await transitionToReady({ ctx, documentId, userId: doc.userId, evt });
        }
        return;
      }

      const existingDrafts = await ctx.runQuery(internal.drafting.postDrafts.listByDocument, {
        documentId,
      });
      const services = createDraftGenerationServiceContext();
      const existingDraftCountBySection = countDraftsBySection(
        existingDrafts.map((draft) => ({
          sectionSummaryId: draft.sectionSummaryId as string | undefined,
          generationBatch: draft.generationBatch,
        })),
      );
      const generationBatch = getNextGenerationBatch(existingDrafts);
      const draftPlanningCandidates = contentSections.map((section) => ({
        sectionSummaryId: section._id as string,
        sectionTitle: section.sectionTitle,
        summary: section.summary,
        chunkStartIndex: section.chunkStartIndex,
        chunkEndIndex: section.chunkEndIndex,
      }));
      const ranking = await rankSectionsForPlanning({
        services,
        sections: draftPlanningCandidates.map((section) => ({
          ...section,
          chunkCount: Math.max(1, section.chunkEndIndex - section.chunkStartIndex + 1),
          existingDraftCount: existingDraftCountBySection.get(section.sectionSummaryId) ?? 0,
        })),
        documentTitle: doc.title,
        language: doc.language,
        learningGoal: doc.learningGoal,
      });
      evt.set({
        rankedSectionCount: ranking.rankings.length,
        rankerTokenUsage: ranking.usage.totalTokens,
      });
      if (ranking.error) evt.set("rankerFailed", ranking.error);
      if (ranking.usage.totalTokens > 0 && ranking.usage.modelId) {
        await captureAiUsage({
          distinctId: doc.userId,
          operation: "card_draft_section_ranking",
          documentId,
          usage: ranking.usage,
          model: ranking.usage.modelId,
        });
      }
      const plan = planDraftGeneration({
        mode,
        generationBatch,
        sections: buildDraftPlanningSections({
          sections: draftPlanningCandidates,
          existingDraftCountBySection,
          rankings: ranking.rankings,
        }),
      });
      const totalBatches = plan.sections.length;

      evt.set({
        generationBatch,
        totalPlannedDrafts: plan.totalDrafts,
        plannedZeroDraftSections: plan.zeroDraftSectionCount,
        plannedQuoteDrafts: plan.quoteDraftCount,
        plannedReplenishmentDepth: plan.previouslyUncoveredDraftShare,
      });

      if (totalBatches === 0) {
        await captureNoDraftsPlanned({
          documentId,
          userId: doc.userId,
          mode,
          generationBatch,
          substantiveSectionCount: contentSections.length,
        });
        if (mode === "initial") {
          await transitionToReady({ ctx, documentId, userId: doc.userId, evt });
        }
        return;
      }

      const jobId = await ctx.runMutation(internal.indexing.processingJobs.create, {
        documentId,
        totalBatches,
      });

      evt.set({ totalBatches, jobId });

      for (const plannedSection of plan.sections) {
        await ctx.scheduler.runAfter(
          0,
          internal.drafting.postDraftSectionGeneration.generateDraftsForSectionBatch,
          {
            jobId,
            documentId,
            sectionSummaryId: plannedSection.sectionSummaryId as Id<"sectionSummaries">,
            postTypes: plannedSection.postTypes,
            generationBatch: plannedSection.generationBatch,
            sectionQualitySignal: plannedSection.qualitySignal,
            mode,
            retryCount: 0,
          },
        );
      }
    } catch (error) {
      evt.setError(error);
      const message = error instanceof Error ? error.message : "Draft generation setup failed";
      await captureDraftSetupFailure({
        documentId,
        userId,
        mode,
        errorMessage: message,
        elapsedMs: evt.getElapsedMs(),
      });
      if (mode === "initial") {
        await ctx.runMutation(internal.content.documents.updateStatus, {
          id: documentId,
          status: "error",
          errorMessage: message,
          failedAt: "generating_cards",
        });
      }
      // Error is not re-thrown intentionally: document status and WideEvent capture
      // the failure for initial processing, while replenishment failures are
      // observability-only so ready documents stay usable.
    } finally {
      evt.emit();
    }
  },
});
