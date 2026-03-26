"use node";

import { v } from "convex/values";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { internalAction } from "../_generated/server";
import { WideEvent } from "../lib/logging";
import { captureEvent } from "../../src/providers/analytics";

import {
  getPollDelay,
  INITIAL_POLL_DELAY_MS,
  MAX_POLL_DURATION_MS,
  storeMarkdownBlob,
} from "./helpers";
import { interpretPollResult, submitForParsing } from "../../src/pipeline/logic/parsing";
import { createParsingServiceContext } from "./services";

interface DatalabSubmitArgs {
  ctx: ActionCtx;
  documentId: Id<"documents">;
  storageId: Id<"_storage">;
  userId: string;
  evt: WideEvent;
}

export async function submitDatalabParsingImpl({
  ctx,
  documentId,
  storageId,
  userId,
  evt,
}: DatalabSubmitArgs) {
  try {
    const fileUrl = await ctx.storage.getUrl(storageId);
    if (!fileUrl) throw new Error("File not found in storage");

    const services = createParsingServiceContext();
    const { checkUrl } = await submitForParsing({ fileUrl, services });

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
    await ctx.runMutation(internal.documents.updateStatus, {
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
      },
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
  returns: v.null(),
  handler: async (ctx, { documentId, checkUrl, attempt, startedAt }) => {
    const evt = new WideEvent("pipeline.pollDatalabResult");
    evt.set({ documentId, attempt });
    let doc:
      | Awaited<ReturnType<typeof ctx.runQuery<typeof internal.documents.getInternal>>>
      | undefined;
    try {
      doc = await ctx.runQuery(internal.documents.getInternal, { id: documentId });
      if (!doc) throw new Error(`Document ${documentId} not found`);
      if (doc.status === "deleting") return;

      const elapsed = Date.now() - startedAt;
      evt.set("elapsedMs", elapsed);

      const services = createParsingServiceContext();
      const pollResult = await services.parser.poll(checkUrl);
      const interpreted = interpretPollResult({
        pollResult,
        elapsedMs: elapsed,
        maxDurationMs: MAX_POLL_DURATION_MS,
      });

      evt.set("pollResult", interpreted.status);

      switch (interpreted.status) {
        case "complete": {
          const markdownStorageId = await storeMarkdownBlob(ctx, interpreted.markdown);
          await ctx.scheduler.runAfter(0, internal.pipeline.chunking.chunkAndStore, {
            documentId,
            markdownStorageId,
          });
          await captureEvent({
            distinctId: doc.userId,
            event: "pipeline.stage_completed",
            properties: {
              stage: "parsing",
              document_id: documentId,
              file_type: doc.fileType,
              duration_ms: elapsed,
            },
          });
          return;
        }

        case "error": {
          await ctx.runMutation(internal.documents.updateStatus, {
            id: documentId,
            status: "error",
            errorMessage: interpreted.errorMessage,
            failedAt: "parsing",
          });
          await captureEvent({
            distinctId: doc.userId,
            event: "pipeline.stage_failed",
            properties: {
              stage: "parsing",
              document_id: documentId,
              file_type: doc.fileType,
              error: interpreted.errorMessage,
            },
          });
          return;
        }

        case "timeout": {
          await ctx.runMutation(internal.documents.updateStatus, {
            id: documentId,
            status: "error",
            errorMessage: "Document parsing timed out after 5 minutes",
            failedAt: "parsing",
          });
          await captureEvent({
            distinctId: doc.userId,
            event: "pipeline.stage_failed",
            properties: {
              stage: "parsing",
              document_id: documentId,
              file_type: doc.fileType,
              error: "Document parsing timed out after 5 minutes",
            },
          });
          return;
        }

        case "pending": {
          const nextDelay = getPollDelay(attempt);
          await ctx.scheduler.runAfter(nextDelay, internal.pipeline.parsing.pollDatalabResult, {
            documentId,
            checkUrl,
            attempt: attempt + 1,
            startedAt,
          });
          return;
        }
      }
    } catch (error) {
      evt.setError(error);
      const message = error instanceof Error ? error.message : "Polling failed";
      await ctx.runMutation(internal.documents.updateStatus, {
        id: documentId,
        status: "error",
        errorMessage: message,
        failedAt: "parsing",
      });
      await captureEvent({
        distinctId: doc?.userId ?? `unresolved:${documentId}`,
        event: "pipeline.stage_failed",
        properties: {
          stage: "parsing",
          document_id: documentId,
          error: message,
        },
      });
    } finally {
      evt.emit();
    }
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
    const doc = await ctx.runQuery(internal.documents.getInternal, { id: documentId });
    if (!doc) throw new Error(`Document ${documentId} not found`);
    if (doc.status === "deleting") return;

    const url = await ctx.storage.getUrl(storageId);
    if (!url) throw new Error("File not found in storage");

    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to download file: ${response.statusText}`);

    const text = await response.text();
    if (!text.trim()) throw new Error("File is empty");

    const markdownStorageId = await storeMarkdownBlob(ctx, text);
    await ctx.scheduler.runAfter(0, internal.pipeline.chunking.chunkAndStore, {
      documentId,
      markdownStorageId,
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
    await ctx.runMutation(internal.documents.updateStatus, {
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
      },
    });
  }
}
