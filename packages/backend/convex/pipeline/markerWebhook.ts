"use node";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { httpAction } from "../_generated/server";
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

export const markerWebhookHandler = httpAction(async (ctx, request) => {
  const evt = new WideEvent("pipeline.markerWebhook");
  try {
    const url = new URL(request.url);
    const secret = url.searchParams.get("secret");
    const expectedSecret = process.env.MARKER_WEBHOOK_SECRET;

    if (!expectedSecret || secret !== expectedSecret) {
      evt.set("rejectionReason", "unauthorized");
      return new Response("Unauthorized", { status: 401 });
    }

    const body = (await request.json()) as RunPodWebhookPayload;
    evt.set({ runpodJobId: body.id, runpodStatus: body.status });

    if (body.status === "COMPLETED") {
      return await handleCompleted(ctx, body, evt);
    }

    if (body.status === "FAILED") {
      return await handleFailed(ctx, body, evt);
    }

    evt.set("result", "ignored");
    return new Response("OK", { status: 200 });
  } catch (error) {
    evt.setError(error);
    return new Response("Internal error", { status: 500 });
  } finally {
    evt.emit();
  }
});

async function handleCompleted(
  ctx: Parameters<Parameters<typeof httpAction>[0]>[0],
  body: RunPodWebhookPayload,
  evt: WideEvent,
): Promise<Response> {
  const markdown = body.output?.markdown?.trim();
  const documentId = resolveDocumentId(body);

  if (!documentId) {
    evt.set("rejectionReason", "missing document_id in payload");
    return new Response("Missing document_id", { status: 400 });
  }

  const docId = documentId as Id<"documents">;
  const doc = await ctx.runQuery(internal.documents.getInternal, { id: docId });

  if (!doc) {
    evt.set("rejectionReason", "document not found");
    return new Response("Document not found", { status: 404 });
  }
  if (doc.status !== "parsing") {
    evt.set("skipped", `document status is ${doc.status}, expected parsing`);
    return new Response("OK", { status: 200 });
  }
  if (doc.runpodJobId && doc.runpodJobId !== body.id) {
    evt.set("skipped", "runpodJobId mismatch (stale webhook)");
    return new Response("OK", { status: 200 });
  }

  if (!markdown) {
    await ctx.runMutation(internal.documents.updateStatus, {
      id: docId,
      status: "error",
      errorMessage: "Marker returned empty markdown",
      failedAt: "parsing",
    });
    evt.set("result", "error_empty_markdown");
    return new Response("OK", { status: 200 });
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
  return new Response("OK", { status: 200 });
}

async function handleFailed(
  ctx: Parameters<Parameters<typeof httpAction>[0]>[0],
  body: RunPodWebhookPayload,
  evt: WideEvent,
): Promise<Response> {
  const documentId = resolveDocumentId(body);
  const errorMessage = body.error ?? "Marker processing failed";
  evt.set({ errorMessage, documentId: documentId ?? "unknown" });

  if (!documentId) {
    evt.set("rejectionReason", "FAILED webhook without document_id");
    return new Response("OK", { status: 200 });
  }

  const docId = documentId as Id<"documents">;
  const doc = await ctx.runQuery(internal.documents.getInternal, { id: docId });

  if (!doc || doc.status !== "parsing") {
    evt.set("skipped", `document ${!doc ? "not found" : `status is ${doc.status}`}`);
    return new Response("OK", { status: 200 });
  }
  if (doc.runpodJobId && doc.runpodJobId !== body.id) {
    evt.set("skipped", "runpodJobId mismatch (stale webhook)");
    return new Response("OK", { status: 200 });
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
  return new Response("OK", { status: 200 });
}
