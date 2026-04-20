"use node";

import { v } from "convex/values";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { internalAction } from "../_generated/server";
import { WideEvent } from "../../src/platform/logging";
import { captureEvent } from "../../src/providers/analytics/posthog";
import { shouldInferDocumentTitle } from "../../src/indexing/logic/documentMetadata";

import { storeMarkdownBlob } from "./storage";
import type { MarkerClient } from "../../src/providers/extractors/marker";

const MAX_PARSING_DURATION_MS = 600_000; // 10 minutes

interface MarkerSubmitArgs {
  ctx: ActionCtx;
  documentId: Id<"documents">;
  storageId: Id<"_storage">;
  userId: string;
  fileType: string;
  client: MarkerClient;
  evt: WideEvent;
}

export async function submitMarkerParsing({
  ctx,
  documentId,
  storageId,
  userId,
  fileType,
  client,
  evt,
}: MarkerSubmitArgs) {
  try {
    const fileUrl = await ctx.storage.getUrl(storageId);
    if (!fileUrl) throw new Error("File not found in storage");

    const webhookSecret = process.env.MARKER_WEBHOOK_SECRET ?? "";
    const siteUrl = process.env.CONVEX_SITE_URL ?? "";
    const webhookUrl = `${siteUrl}/api/marker-webhook?secret=${webhookSecret}`;

    const result = await client.submitJob({
      fileUrl,
      documentId,
      fileType,
      webhookUrl,
    });

    if (result.kind === "immediate") {
      evt.set("path", "stub_immediate");
      const markdownStorageId = await storeMarkdownBlob(ctx, result.markdown);
      await ctx.scheduler.runAfter(0, internal.indexing.chunking.chunkAndStore, {
        documentId,
        markdownStorageId,
        inferTitle: shouldInferDocumentTitle({ fileType, hasParsedTitle: false }),
      });
      return;
    }

    if (!webhookSecret || !siteUrl) {
      throw new Error("MARKER_WEBHOOK_SECRET and CONVEX_SITE_URL are required");
    }

    evt.set({ runpodJobId: result.jobId });

    await ctx.runMutation(internal.content.documents.setRunpodJobId, {
      id: documentId,
      jobId: result.jobId,
      submittedAt: Date.now(),
    });

    await ctx.scheduler.runAfter(
      MAX_PARSING_DURATION_MS,
      internal.indexing.parsing.checkParsingTimeout,
      { documentId },
    );
  } catch (error) {
    evt.setError(error);
    const message = error instanceof Error ? error.message : "Marker submission failed";
    await ctx.runMutation(internal.content.documents.updateStatus, {
      id: documentId,
      status: "error",
      errorMessage: message,
      failedAt: "parsing",
    });
    await captureEvent({
      distinctId: userId,
      event: "pipeline.stage_failed",
      properties: {
        stage: "parsing",
        document_id: documentId,
        error: message,
        provider: "marker",
      },
    });
  }
}

export const checkParsingTimeout = internalAction({
  args: { documentId: v.id("documents") },
  returns: v.null(),
  handler: async (ctx, { documentId }) => {
    const doc = await ctx.runQuery(internal.content.documents.getInternal, { id: documentId });
    if (!doc || doc.status !== "parsing") return null;

    await ctx.runMutation(internal.content.documents.updateStatus, {
      id: documentId,
      status: "error",
      errorMessage: "Document parsing timed out after 10 minutes",
      failedAt: "parsing",
    });
    try {
      await captureEvent({
        distinctId: doc.userId,
        event: "pipeline.stage_failed",
        properties: {
          stage: "parsing",
          document_id: documentId,
          error: "Document parsing timed out after 10 minutes",
          provider: "marker",
        },
      });
    } catch {
      // Analytics failure should not crash the timeout handler
    }
    return null;
  },
});

interface MarkdownParseArgs {
  ctx: ActionCtx;
  documentId: Id<"documents">;
  storageId: Id<"_storage">;
  userId: string;
  fileType: string;
  evt: WideEvent;
}

export async function fetchAndParseMarkdownImpl({
  ctx,
  documentId,
  storageId,
  userId,
  fileType,
  evt,
}: MarkdownParseArgs) {
  const startMs = Date.now();
  try {
    const doc = await ctx.runQuery(internal.content.documents.getInternal, { id: documentId });
    if (!doc) throw new Error(`Document ${documentId} not found`);
    if (doc.status === "deleting") return;

    const url = await ctx.storage.getUrl(storageId);
    if (!url) throw new Error("File not found in storage");

    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to download file: ${response.statusText}`);

    const text = await response.text();
    if (!text.trim()) throw new Error("File is empty");

    const markdownStorageId = await storeMarkdownBlob(ctx, text);
    await ctx.scheduler.runAfter(0, internal.indexing.chunking.chunkAndStore, {
      documentId,
      markdownStorageId,
      inferTitle: false,
    });

    await captureEvent({
      distinctId: userId,
      event: "pipeline.stage_completed",
      properties: {
        stage: "parsing",
        document_id: documentId,
        file_type: fileType,
        duration_ms: Date.now() - startMs,
      },
    });
  } catch (error) {
    evt.setError(error);
    const message = error instanceof Error ? error.message : "Markdown parsing failed";
    await ctx.runMutation(internal.content.documents.updateStatus, {
      id: documentId,
      status: "error",
      errorMessage: message,
      failedAt: "parsing",
    });
    await captureEvent({
      distinctId: userId,
      event: "pipeline.stage_failed",
      properties: {
        stage: "parsing",
        document_id: documentId,
        error: message,
        duration_ms: Date.now() - startMs,
      },
    });
  }
}
