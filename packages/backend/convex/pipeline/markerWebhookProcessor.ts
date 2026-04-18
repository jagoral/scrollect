"use node";

import { v } from "convex/values";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { internalAction } from "../_generated/server";
import { WideEvent } from "../lib/logging";
import { captureEvent } from "../../src/providers/analytics";
import { storeMarkdownBlob, createMarkerClient } from "./helpers";
import {
  cleanDocumentTitle,
  shouldInferDocumentTitle,
} from "../../src/pipeline/logic/documentMetadata";

interface RunPodWebhookPayload {
  id: string;
  status: "COMPLETED" | "FAILED" | "IN_QUEUE" | "IN_PROGRESS";
  input?: {
    document_id?: string;
  };
  output?: {
    markdown?: string;
    document_id?: string;
    title?: string;
    author?: string;
    image_base64?: string;
    image_mime_type?: string;
    cover_base64?: string;
    cover_mime_type?: string;
  };
  error?: string;
}

function resolveDocumentId(body: RunPodWebhookPayload): string | undefined {
  return body.output?.document_id ?? body.input?.document_id;
}

export const processWebhook = internalAction({
  args: { payload: v.string() },
  returns: v.null(),
  handler: async (ctx, { payload }) => {
    const evt = new WideEvent("pipeline.markerWebhook");
    try {
      const body = JSON.parse(payload) as RunPodWebhookPayload;
      evt.set({ runpodJobId: body.id, runpodStatus: body.status });

      if (body.status === "COMPLETED") {
        await handleCompleted(ctx, body, evt);
      } else if (body.status === "FAILED") {
        await handleFailed(ctx, body, evt);
      } else {
        evt.set("result", "ignored");
      }
    } catch (error) {
      evt.setError(error);
      throw error;
    } finally {
      evt.emit();
    }
    return null;
  },
});

async function handleCompleted(ctx: ActionCtx, body: RunPodWebhookPayload, evt: WideEvent) {
  const markdown = body.output?.markdown?.trim();
  const documentId = resolveDocumentId(body);

  if (!documentId) {
    evt.set("rejectionReason", "missing document_id in payload");
    return;
  }

  const docId = documentId as Id<"documents">;
  const doc = await ctx.runQuery(internal.documents.getInternal, { id: docId });

  if (!doc) {
    evt.set("rejectionReason", "document not found");
    return;
  }
  if (doc.status !== "parsing") {
    evt.set("skipped", `document status is ${doc.status}, expected parsing`);
    return;
  }
  if (doc.runpodJobId && doc.runpodJobId !== body.id) {
    evt.set("skipped", "runpodJobId mismatch (stale webhook)");
    return;
  }

  if (!markdown) {
    await ctx.runMutation(internal.documents.updateStatus, {
      id: docId,
      status: "error",
      errorMessage: "Marker returned empty markdown",
      failedAt: "parsing",
    });
    evt.set("result", "error_empty_markdown");
    return;
  }

  const parsingDurationMs = doc.runpodSubmittedAt ? Date.now() - doc.runpodSubmittedAt : undefined;
  evt.set({ parsingDurationMs, markdownLength: markdown.length });

  const metadata = await applyParsedMetadata({ ctx, docId, output: body.output, evt });
  const markdownStorageId = await storeMarkdownBlob(ctx, markdown);
  await ctx.scheduler.runAfter(0, internal.pipeline.chunking.chunkAndStore, {
    documentId: docId,
    markdownStorageId,
    inferTitle: shouldInferDocumentTitle({
      fileType: doc.fileType,
      hasParsedTitle: metadata.hasTitle,
    }),
  });

  try {
    await captureEvent({
      distinctId: doc.userId,
      event: "pipeline.stage_completed",
      properties: {
        stage: "parsing",
        document_id: documentId,
        file_type: doc.fileType,
        provider: "marker",
        duration_ms: parsingDurationMs,
      },
    });
  } catch {
    evt.set("analyticsError", true);
  }

  await captureRunPodCost({ jobId: body.id, documentId, userId: doc.userId, evt });

  evt.set("result", "complete");
}

async function applyParsedMetadata(opts: {
  ctx: ActionCtx;
  docId: Id<"documents">;
  output: RunPodWebhookPayload["output"];
  evt: WideEvent;
}): Promise<{ hasTitle: boolean; hasThumbnail: boolean }> {
  const title = cleanDocumentTitle(opts.output?.title);
  const thumbnailUrl = await storeParsedImage({
    ctx: opts.ctx,
    output: opts.output,
    evt: opts.evt,
  });

  if (title || thumbnailUrl) {
    await opts.ctx.runMutation(internal.documents.updateMetadata, {
      id: opts.docId,
      ...(title ? { title } : {}),
      ...(thumbnailUrl ? { thumbnailUrl } : {}),
    });
  }

  opts.evt.set({
    parsedTitle: !!title,
    parsedAuthor: !!opts.output?.author,
    parsedThumbnail: !!thumbnailUrl,
  });

  return { hasTitle: !!title, hasThumbnail: !!thumbnailUrl };
}

async function storeParsedImage(opts: {
  ctx: ActionCtx;
  output: RunPodWebhookPayload["output"];
  evt: WideEvent;
}): Promise<string | undefined> {
  const imageBase64 = opts.output?.image_base64 ?? opts.output?.cover_base64;
  if (!imageBase64) return undefined;

  try {
    const mimeType = opts.output?.image_mime_type ?? opts.output?.cover_mime_type ?? "image/jpeg";
    const imageBytes = Buffer.from(imageBase64, "base64");
    if (imageBytes.length === 0) return undefined;

    const storageId = await opts.ctx.storage.store(new Blob([imageBytes], { type: mimeType }));
    return (await opts.ctx.storage.getUrl(storageId)) ?? undefined;
  } catch (error) {
    opts.evt.set({
      parsedImageStorageError: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  }
}

const RUNPOD_COST_PER_SEC = 0.00016; // RTX A4500

async function captureRunPodCost(opts: {
  jobId: string;
  documentId: string;
  userId: string;
  evt: WideEvent;
}) {
  const { jobId, documentId, userId, evt } = opts;
  try {
    const client = createMarkerClient();
    const status = await client.getJobStatus?.(jobId);
    if (!status) return;

    const executionTimeSec = status.executionTimeMs / 1000;
    const costUsd = Math.round(executionTimeSec * RUNPOD_COST_PER_SEC * 1_000_000) / 1_000_000;
    evt.set({ runpodExecutionTimeMs: status.executionTimeMs, runpodCostUsd: costUsd });

    await captureEvent({
      distinctId: userId,
      event: "runpod.gpu_usage",
      properties: {
        document_id: documentId,
        runpod_job_id: jobId,
        execution_time_ms: status.executionTimeMs,
        delay_time_ms: status.delayTimeMs,
        estimated_cost_usd: costUsd,
        gpu_type: "RTX A4500",
      },
    });
  } catch {
    evt.set("runpodCostTrackingError", true);
  }
}

async function handleFailed(ctx: ActionCtx, body: RunPodWebhookPayload, evt: WideEvent) {
  const documentId = resolveDocumentId(body);
  const errorMessage = body.error ?? "Marker processing failed";
  evt.set({ errorMessage, documentId: documentId ?? "unknown" });

  if (!documentId) {
    evt.set("rejectionReason", "FAILED webhook without document_id");
    return;
  }

  const docId = documentId as Id<"documents">;
  const doc = await ctx.runQuery(internal.documents.getInternal, { id: docId });

  if (!doc || doc.status !== "parsing") {
    evt.set("skipped", `document ${!doc ? "not found" : `status is ${doc.status}`}`);
    return;
  }
  if (doc.runpodJobId && doc.runpodJobId !== body.id) {
    evt.set("skipped", "runpodJobId mismatch (stale webhook)");
    return;
  }

  await ctx.runMutation(internal.documents.updateStatus, {
    id: docId,
    status: "error",
    errorMessage,
    failedAt: "parsing",
  });

  try {
    await captureEvent({
      distinctId: doc.userId,
      event: "pipeline.stage_failed",
      properties: {
        stage: "parsing",
        document_id: documentId,
        error: errorMessage,
        provider: "marker",
      },
    });
  } catch {
    evt.set("analyticsError", true);
  }

  evt.set("result", "failed");
}
