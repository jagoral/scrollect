"use node";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { WideEvent } from "../lib/logging";
import { captureEvent } from "../providers/analytics";

import { createArticleExtractor, createYouTubeExtractor, storeMarkdownBlob } from "./helpers";

interface ExtractionArgs {
  ctx: ActionCtx;
  documentId: Id<"documents">;
  sourceUrl: string;
  userId: string;
  fileType: string;
  evt: WideEvent;
}

export async function extractArticleImpl({
  ctx,
  documentId,
  sourceUrl,
  userId,
  fileType,
  evt,
}: ExtractionArgs) {
  const startMs = Date.now();
  try {
    const doc = await ctx.runQuery(internal.documents.getInternal, { id: documentId });
    if (!doc) throw new Error(`Document ${documentId} not found`);
    if (doc.status === "deleting") return;

    const extractor = createArticleExtractor();
    const result = await extractor.extract(sourceUrl);

    evt.set("markdownLength", result.markdown.length);

    if (result.title) {
      await ctx.runMutation(internal.documents.updateTitle, {
        id: documentId,
        title: result.title,
      });
    }

    const markdownStorageId = await storeMarkdownBlob(ctx, result.markdown);
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
    const message = error instanceof Error ? error.message : "Article extraction failed";
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
        file_type: "article",
        error: message,
      },
    });
  }
}

export async function extractYouTubeImpl({
  ctx,
  documentId,
  sourceUrl,
  userId,
  fileType,
  evt,
}: ExtractionArgs) {
  const startMs = Date.now();
  try {
    const doc = await ctx.runQuery(internal.documents.getInternal, { id: documentId });
    if (!doc) throw new Error(`Document ${documentId} not found`);
    if (doc.status === "deleting") return;

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

    const markdownStorageId = await storeMarkdownBlob(ctx, result.markdown);
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
    const message = error instanceof Error ? error.message : "YouTube extraction failed";
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
        file_type: "youtube",
        error: message,
      },
    });
  }
}
