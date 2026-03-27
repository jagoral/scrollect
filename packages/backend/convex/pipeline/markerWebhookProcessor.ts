"use node";

import { v } from "convex/values";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { internalAction } from "../_generated/server";
import { WideEvent } from "../lib/logging";
import { captureEvent } from "../../src/providers/analytics";
import { storeMarkdownBlob } from "./helpers";

interface RunPodWebhookPayload {
  id: string;
  status: "COMPLETED" | "FAILED" | "IN_QUEUE" | "IN_PROGRESS";
  input?: {
    document_id?: string;
  };
  output?: {
    markdown?: string;
    document_id?: string;
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

  const markdownStorageId = await storeMarkdownBlob(ctx, markdown);
  await ctx.scheduler.runAfter(0, internal.pipeline.chunking.chunkAndStore, {
    documentId: docId,
    markdownStorageId,
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

  evt.set("result", "complete");
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
