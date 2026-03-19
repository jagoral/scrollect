"use node";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { WideEvent } from "../lib/logging";
import { captureEvent } from "../providers/analytics";

import { createArticleExtractor, createYouTubeExtractor, storeMarkdownBlob } from "./helpers";

export async function extractArticleImpl(
  ctx: ActionCtx,
  documentId: Id<"documents">,
  sourceUrl: string,
  evt: WideEvent,
) {
  const startMs = Date.now();
  const doc = await ctx.runQuery(internal.documents.getInternal, { id: documentId });
  if (!doc) throw new Error(`Document ${documentId} not found`);
  if (doc.status === "deleting") return;
  try {
    const extractor = createArticleExtractor();
    const result = await extractor.extract(sourceUrl);

    evt.set("markdownLength", result.markdown.length);

    if (result.title) {
      await ctx.runMutation(internal.documents.updateTitle, {
        id: documentId,
        title: result.title,
      });
    }

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

    const markdownStorageId = await storeMarkdownBlob(ctx, result.markdown);
    await ctx.scheduler.runAfter(0, internal.pipeline.chunking.chunkAndStore, {
      documentId,
      markdownStorageId,
    });
  } catch (error) {
    evt.setError(error);
    const message = error instanceof Error ? error.message : "Article extraction failed";
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

export async function extractYouTubeImpl(
  ctx: ActionCtx,
  documentId: Id<"documents">,
  sourceUrl: string,
  evt: WideEvent,
) {
  const startMs = Date.now();
  const doc = await ctx.runQuery(internal.documents.getInternal, { id: documentId });
  if (!doc) throw new Error(`Document ${documentId} not found`);
  if (doc.status === "deleting") return;
  try {
    const extractor = createYouTubeExtractor();
    const result = await extractor.extract(sourceUrl);

    evt.set({
      markdownLength: result.markdown.length,
      provider: (result.metadata as Record<string, unknown>)?.provider,
    });

    if (result.title) {
      await ctx.runMutation(internal.documents.updateTitle, {
        id: documentId,
        title: result.title,
      });
    }

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

    const markdownStorageId = await storeMarkdownBlob(ctx, result.markdown);
    await ctx.scheduler.runAfter(0, internal.pipeline.chunking.chunkAndStore, {
      documentId,
      markdownStorageId,
    });
  } catch (error) {
    evt.setError(error);
    const message = error instanceof Error ? error.message : "YouTube extraction failed";
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
