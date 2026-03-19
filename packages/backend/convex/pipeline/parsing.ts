"use node";

import { v } from "convex/values";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { internalAction } from "../_generated/server";
import { WideEvent } from "../lib/logging";
import { captureEvent } from "../providers/analytics";

import {
  createDocumentParser,
  getPollDelay,
  INITIAL_POLL_DELAY_MS,
  MAX_POLL_DURATION_MS,
  storeMarkdownBlob,
} from "./helpers";

export async function submitDatalabParsingImpl(
  ctx: ActionCtx,
  documentId: Id<"documents">,
  storageId: Id<"_storage">,
  evt: WideEvent,
) {
  const doc = await ctx.runQuery(internal.documents.getInternal, { id: documentId });
  try {
    const fileUrl = await ctx.storage.getUrl(storageId);
    if (!fileUrl) throw new Error("File not found in storage");

    const parser = createDocumentParser();
    const checkUrl = await parser.submit(fileUrl);

    // Persist checkpoint BEFORE polling starts
    await ctx.runMutation(internal.documents.setDatalabCheckUrl, {
      id: documentId,
      checkUrl,
    });

    const startedAt = Date.now();
    await ctx.scheduler.runAfter(
      INITIAL_POLL_DELAY_MS,
      internal.pipeline.parsing.pollDatalabResult,
      {
        documentId,
        checkUrl,
        attempt: 0,
        startedAt,
      },
    );
  } catch (error) {
    evt.setError(error);
    const message = error instanceof Error ? error.message : "Document submission failed";
    captureEvent({
      distinctId: doc?.userId ?? "unknown",
      event: "pipeline.stage_failed",
      properties: {
        stage: "parsing",
        document_id: documentId,
        error: message,
      },
    });
    await ctx.runMutation(internal.documents.updateStatus, {
      id: documentId,
      status: "error",
      errorMessage: message,
      failedAt: "parsing",
    });
  }
}

export const pollDatalabResult = internalAction({
  args: {
    documentId: v.id("documents"),
    checkUrl: v.string(),
    attempt: v.number(),
    startedAt: v.number(),
  },
  handler: async (ctx, { documentId, checkUrl, attempt, startedAt }) => {
    const evt = new WideEvent("pipeline.pollDatalabResult");
    evt.set({ documentId, attempt });
    const doc = await ctx.runQuery(internal.documents.getInternal, { id: documentId });
    if (!doc) throw new Error(`Document ${documentId} not found`);
    if (doc.status === "deleting") return;
    try {
      const elapsed = Date.now() - startedAt;
      evt.set("elapsedMs", elapsed);

      if (elapsed > MAX_POLL_DURATION_MS) {
        evt.set("pollResult", "timeout");
        captureEvent({
          distinctId: doc.userId,
          event: "pipeline.stage_failed",
          properties: {
            stage: "parsing",
            document_id: documentId,
            file_type: doc.fileType,
            error: "Document parsing timed out after 5 minutes",
          },
        });
        await ctx.runMutation(internal.documents.updateStatus, {
          id: documentId,
          status: "error",
          errorMessage: "Document parsing timed out after 5 minutes",
          failedAt: "parsing",
        });
        return;
      }

      const parser = createDocumentParser();
      const result = await parser.poll(checkUrl);

      if (result.status === "complete") {
        evt.set("pollResult", "complete");
        captureEvent({
          distinctId: doc.userId,
          event: "pipeline.stage_completed",
          properties: {
            stage: "parsing",
            document_id: documentId,
            file_type: doc.fileType,
            duration_ms: elapsed,
          },
        });
        const markdownStorageId = await storeMarkdownBlob(ctx, result.markdown!);
        await ctx.scheduler.runAfter(0, internal.pipeline.chunking.chunkAndStore, {
          documentId,
          markdownStorageId,
        });
        return;
      }

      if (result.status === "error") {
        evt.set("pollResult", "error");
        captureEvent({
          distinctId: doc.userId,
          event: "pipeline.stage_failed",
          properties: {
            stage: "parsing",
            document_id: documentId,
            file_type: doc.fileType,
            error: result.errorMessage ?? "Document parsing failed",
          },
        });
        await ctx.runMutation(internal.documents.updateStatus, {
          id: documentId,
          status: "error",
          errorMessage: result.errorMessage ?? "Document parsing failed",
          failedAt: "parsing",
        });
        return;
      }

      evt.set("pollResult", "pending");
      // Still pending — schedule next poll with exponential backoff
      const nextDelay = getPollDelay(attempt);
      await ctx.scheduler.runAfter(nextDelay, internal.pipeline.parsing.pollDatalabResult, {
        documentId,
        checkUrl,
        attempt: attempt + 1,
        startedAt,
      });
    } catch (error) {
      evt.setError(error);
      const message = error instanceof Error ? error.message : "Polling failed";
      captureEvent({
        distinctId: doc.userId,
        event: "pipeline.stage_failed",
        properties: {
          stage: "parsing",
          document_id: documentId,
          file_type: doc.fileType,
          error: message,
        },
      });
      await ctx.runMutation(internal.documents.updateStatus, {
        id: documentId,
        status: "error",
        errorMessage: message,
        failedAt: "parsing",
      });
    } finally {
      evt.emit();
    }
  },
});

export async function fetchAndParseMarkdownImpl(
  ctx: ActionCtx,
  documentId: Id<"documents">,
  storageId: Id<"_storage">,
  evt: WideEvent,
) {
  const startMs = Date.now();
  const doc = await ctx.runQuery(internal.documents.getInternal, { id: documentId });
  if (!doc) throw new Error(`Document ${documentId} not found`);
  if (doc.status === "deleting") return;
  try {
    const url = await ctx.storage.getUrl(storageId);
    if (!url) throw new Error("File not found in storage");

    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to download file: ${response.statusText}`);

    const text = await response.text();
    if (!text.trim()) throw new Error("File is empty");

    captureEvent({
      distinctId: doc.userId,
      event: "pipeline.stage_completed",
      properties: {
        stage: "parsing",
        document_id: documentId,
        file_type: doc.fileType,
        duration_ms: Date.now() - startMs,
      },
    });

    const markdownStorageId = await storeMarkdownBlob(ctx, text);
    await ctx.scheduler.runAfter(0, internal.pipeline.chunking.chunkAndStore, {
      documentId,
      markdownStorageId,
    });
  } catch (error) {
    evt.setError(error);
    const message = error instanceof Error ? error.message : "Markdown parsing failed";
    captureEvent({
      distinctId: doc.userId,
      event: "pipeline.stage_failed",
      properties: {
        stage: "parsing",
        document_id: documentId,
        file_type: doc.fileType,
        error: message,
      },
    });
    await ctx.runMutation(internal.documents.updateStatus, {
      id: documentId,
      status: "error",
      errorMessage: message,
      failedAt: "parsing",
    });
  }
}
