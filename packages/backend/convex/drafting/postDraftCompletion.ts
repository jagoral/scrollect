"use node";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import type { WideEvent } from "../../src/platform/logging";
import { captureEvent } from "../../src/providers/analytics/posthog";

import { captureDraftGenerationAnalytics, type DraftGenerationMode } from "./postDraftAnalytics";
import { transitionToReady } from "../indexing/readyTransition";

const MIN_SECTIONS_FOR_THEMATIC = 3;

export async function checkPostDraftGenerationCompletion(opts: {
  ctx: ActionCtx;
  job: { totalBatches: number; completedBatches: number; failedBatches: number };
  documentId: Id<"documents">;
  userId: string | undefined;
  evt: WideEvent;
  mode: DraftGenerationMode;
  generationBatch: number;
  lastError?: unknown;
}) {
  const { ctx, job, documentId, userId, evt, mode, generationBatch, lastError } = opts;

  if (job.completedBatches + job.failedBatches < job.totalBatches) {
    return;
  }

  const resolvedUserId = userId ?? (await resolveUserId({ ctx, documentId }));

  if (job.failedBatches > 0 && job.completedBatches === 0) {
    await handleCompleteFailure({
      ctx,
      job,
      documentId,
      userId: resolvedUserId,
      evt,
      mode,
      lastError,
    });
    return;
  }

  if (job.failedBatches > 0) {
    await capturePartialFailure({ job, documentId, userId: resolvedUserId, mode, evt });
  }

  await captureDraftGenerationAnalytics({
    ctx,
    documentId,
    userId: resolvedUserId,
    mode,
    generationBatch,
    evt,
  });

  if (mode === "replenishment") {
    return;
  }

  if (job.totalBatches >= MIN_SECTIONS_FOR_THEMATIC && job.completedBatches > 0) {
    evt.set("schedulingThematicGeneration", true);
    await ctx.scheduler.runAfter(
      0,
      internal.drafting.thematicDraftGeneration.generateThematicDraftsForDocument,
      { documentId },
    );
    return;
  }

  await transitionToReady({ ctx, documentId, userId: resolvedUserId, evt });
}

async function handleCompleteFailure(opts: {
  ctx: ActionCtx;
  job: { totalBatches: number; failedBatches: number };
  documentId: Id<"documents">;
  userId: string | undefined;
  evt: WideEvent;
  mode: DraftGenerationMode;
  lastError?: unknown;
}) {
  const { ctx, job, documentId, userId, evt, mode, lastError } = opts;
  const errorMessage =
    lastError instanceof Error
      ? `All ${job.failedBatches} draft generation batches failed: ${lastError.message}`
      : `All ${job.failedBatches}/${job.totalBatches} draft generation batches failed`;

  if (mode === "replenishment") {
    evt.set("replenishmentFailure", { failedBatches: job.failedBatches, errorMessage });
    await captureStageFailure({
      userId,
      stage: "replenishing_cards",
      documentId,
      job,
      errorMessage,
      evt,
    });
    return;
  }

  await ctx.runMutation(internal.content.documents.updateStatus, {
    id: documentId,
    status: "error",
    errorMessage,
    failedAt: "generating_cards",
  });
  await captureStageFailure({
    userId,
    stage: "generating_cards",
    documentId,
    job,
    errorMessage,
    evt,
  });
}

async function capturePartialFailure(opts: {
  job: { totalBatches: number; completedBatches: number; failedBatches: number };
  documentId: Id<"documents">;
  userId: string | undefined;
  mode: DraftGenerationMode;
  evt: WideEvent;
}) {
  const { job, documentId, userId, mode, evt } = opts;
  evt.set("partialFailure", {
    failedBatches: job.failedBatches,
    totalBatches: job.totalBatches,
  });
  if (!userId) return;

  await captureEvent({
    distinctId: userId,
    event: "pipeline.stage_partial_failure",
    properties: {
      stage: mode === "initial" ? "generating_cards" : "replenishing_cards",
      document_id: documentId,
      total_batches: job.totalBatches,
      failed_batches: job.failedBatches,
      completed_batches: job.completedBatches,
      duration_ms: evt.getElapsedMs(),
    },
  });
}

async function captureStageFailure(opts: {
  userId: string | undefined;
  stage: "generating_cards" | "replenishing_cards";
  documentId: Id<"documents">;
  job: { totalBatches: number; failedBatches: number };
  errorMessage: string;
  evt: WideEvent;
}) {
  const { userId, stage, documentId, job, errorMessage, evt } = opts;
  if (!userId) return;

  await captureEvent({
    distinctId: userId,
    event: "pipeline.stage_failed",
    properties: {
      stage,
      document_id: documentId,
      total_batches: job.totalBatches,
      failed_batches: job.failedBatches,
      error: errorMessage,
      duration_ms: evt.getElapsedMs(),
    },
  });
}

async function resolveUserId(opts: {
  ctx: ActionCtx;
  documentId: Id<"documents">;
}): Promise<string | undefined> {
  const doc = await opts.ctx.runQuery(internal.content.documents.getInternal, {
    id: opts.documentId,
  });
  return doc?.userId;
}
