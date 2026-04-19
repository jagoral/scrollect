"use node";

import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { WideEvent } from "../../src/platform/logging";
import { captureEvent } from "../../src/providers/analytics/posthog";

export type DraftGenerationMode = "initial" | "replenishment";

export async function captureNoDraftsPlanned(opts: {
  documentId: Id<"documents">;
  userId: string;
  mode: DraftGenerationMode;
  generationBatch: number;
  substantiveSectionCount: number;
}) {
  const { documentId, userId, mode, generationBatch, substantiveSectionCount } = opts;

  if (mode === "initial") {
    await captureEvent({
      distinctId: userId,
      event: "pipeline.initial_pool_size",
      properties: {
        document_id: documentId,
        generation_batch: generationBatch,
        drafts_produced: 0,
      },
    });
    await captureEvent({
      distinctId: userId,
      event: "pipeline.sections_with_zero_drafts",
      properties: {
        document_id: documentId,
        generation_batch: generationBatch,
        mode,
        count: substantiveSectionCount,
        substantive_section_count: substantiveSectionCount,
      },
    });
    return;
  }

  await captureEvent({
    distinctId: userId,
    event: "pipeline.replenishment_depth",
    properties: {
      document_id: documentId,
      generation_batch: generationBatch,
      drafts_produced: 0,
      previously_uncovered_draft_share: 0,
    },
  });
}

export async function captureDraftSetupFailure(opts: {
  documentId: Id<"documents">;
  userId: string | undefined;
  mode: DraftGenerationMode;
  errorMessage: string;
  elapsedMs: number;
}) {
  if (!opts.userId) return;

  await captureEvent({
    distinctId: opts.userId,
    event: "pipeline.stage_failed",
    properties: {
      stage: opts.mode === "initial" ? "generating_cards" : "replenishing_cards",
      document_id: opts.documentId,
      error: opts.errorMessage,
      duration_ms: opts.elapsedMs,
    },
  });
}

export async function captureDraftGenerationAnalytics(opts: {
  ctx: ActionCtx;
  documentId: Id<"documents">;
  userId: string | undefined;
  mode: DraftGenerationMode;
  generationBatch: number;
  evt: WideEvent;
}) {
  const { ctx, documentId, userId, mode, generationBatch, evt } = opts;
  if (!userId) return;

  const [sections, drafts] = await Promise.all([
    ctx.runQuery(internal.sectionSummaries.listByDocument, { documentId }),
    ctx.runQuery(internal.cardDrafts.listByDocument, { documentId }),
  ]);
  const contentSections = sections.filter((section) => section.isSubstantiveContent !== false);
  const batchDrafts = drafts.filter(
    (draft) => draft.generationBatch === generationBatch && draft.strategy === "section",
  );
  const coveredSections = new Set(
    batchDrafts
      .map((draft) => draft.sectionSummaryId)
      .filter((sectionId): sectionId is Id<"sectionSummaries"> => sectionId !== undefined),
  );
  const zeroDraftSections = contentSections.length - coveredSections.size;
  const lengthDistribution = buildLengthDistribution({ drafts: batchDrafts });

  evt.set({
    actualDraftsProduced: batchDrafts.length,
    actualZeroDraftSections: zeroDraftSections,
  });

  if (mode === "initial") {
    await captureEvent({
      distinctId: userId,
      event: "pipeline.initial_pool_size",
      properties: {
        document_id: documentId,
        generation_batch: generationBatch,
        drafts_produced: batchDrafts.length,
      },
    });
  }

  await captureEvent({
    distinctId: userId,
    event: "pipeline.sections_with_zero_drafts",
    properties: {
      document_id: documentId,
      generation_batch: generationBatch,
      mode,
      count: zeroDraftSections,
      substantive_section_count: contentSections.length,
    },
  });

  await captureEvent({
    distinctId: userId,
    event: "pipeline.draft_length_distribution",
    properties: {
      document_id: documentId,
      generation_batch: generationBatch,
      mode,
      by_card_type: lengthDistribution,
    },
  });

  if (mode === "replenishment") {
    const previouslyCoveredSections = new Set(
      drafts
        .filter((draft) => draft.generationBatch < generationBatch)
        .map((draft) => draft.sectionSummaryId)
        .filter((sectionId): sectionId is Id<"sectionSummaries"> => sectionId !== undefined),
    );
    const uncoveredDrafts = batchDrafts.filter(
      (draft) => draft.sectionSummaryId && !previouslyCoveredSections.has(draft.sectionSummaryId),
    );
    await captureEvent({
      distinctId: userId,
      event: "pipeline.replenishment_depth",
      properties: {
        document_id: documentId,
        generation_batch: generationBatch,
        drafts_produced: batchDrafts.length,
        previously_uncovered_draft_share:
          batchDrafts.length === 0 ? 0 : uncoveredDrafts.length / batchDrafts.length,
      },
    });
  }
}

function buildLengthDistribution(opts: {
  drafts: Array<{ cardType: string; content: string }>;
}): Record<string, { count: number; min: number; max: number; avg: number }> {
  const lengthsByType = new Map<string, number[]>();
  for (const draft of opts.drafts) {
    const lengths = lengthsByType.get(draft.cardType) ?? [];
    lengths.push(draft.content.length);
    lengthsByType.set(draft.cardType, lengths);
  }

  return Object.fromEntries(
    [...lengthsByType.entries()].map(([cardType, lengths]) => [
      cardType,
      {
        count: lengths.length,
        min: Math.min(...lengths),
        max: Math.max(...lengths),
        avg: lengths.reduce((sum, length) => sum + length, 0) / lengths.length,
      },
    ]),
  );
}
