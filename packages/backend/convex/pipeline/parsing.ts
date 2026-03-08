"use node";

import { v } from "convex/values";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { internalAction } from "../_generated/server";
import { WideEvent } from "../lib/logging";
import { DatalabParser } from "../providers/datalab";

import {
  getPollDelay,
  INITIAL_POLL_DELAY_MS,
  MAX_POLL_DURATION_MS,
  storeMarkdownBlob,
} from "./helpers";

// --- PDF Parsing ---

export async function submitPdfParsingImpl(
  ctx: ActionCtx,
  documentId: Id<"documents">,
  storageId: Id<"_storage">,
  evt: WideEvent,
) {
  try {
    const apiKey = process.env.DATALAB_API_KEY;
    if (!apiKey) throw new Error("DATALAB_API_KEY environment variable is not set");

    const fileUrl = await ctx.storage.getUrl(storageId);
    if (!fileUrl) throw new Error("File not found in storage");

    const parser = new DatalabParser(apiKey);
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
    const message = error instanceof Error ? error.message : "PDF submission failed";
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
    try {
      const elapsed = Date.now() - startedAt;
      evt.set("elapsedMs", elapsed);

      if (elapsed > MAX_POLL_DURATION_MS) {
        evt.set("pollResult", "timeout");
        await ctx.runMutation(internal.documents.updateStatus, {
          id: documentId,
          status: "error",
          errorMessage: "PDF parsing timed out after 5 minutes",
          failedAt: "parsing",
        });
        return;
      }

      const apiKey = process.env.DATALAB_API_KEY;
      if (!apiKey) throw new Error("DATALAB_API_KEY environment variable is not set");

      const parser = new DatalabParser(apiKey);
      const result = await parser.poll(checkUrl);

      if (result.status === "complete") {
        evt.set("pollResult", "complete");
        const markdownStorageId = await storeMarkdownBlob(ctx, result.markdown!);
        await ctx.scheduler.runAfter(0, internal.pipeline.chunking.chunkAndStore, {
          documentId,
          markdownStorageId,
        });
        return;
      }

      if (result.status === "error") {
        evt.set("pollResult", "error");
        await ctx.runMutation(internal.documents.updateStatus, {
          id: documentId,
          status: "error",
          errorMessage: result.errorMessage ?? "PDF parsing failed",
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

// --- Markdown Parsing ---

export async function fetchAndParseMarkdownImpl(
  ctx: ActionCtx,
  documentId: Id<"documents">,
  storageId: Id<"_storage">,
  evt: WideEvent,
) {
  try {
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
  } catch (error) {
    evt.setError(error);
    const message = error instanceof Error ? error.message : "Markdown parsing failed";
    await ctx.runMutation(internal.documents.updateStatus, {
      id: documentId,
      status: "error",
      errorMessage: message,
      failedAt: "parsing",
    });
  }
}
