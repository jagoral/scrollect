"use node";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { WideEvent } from "../lib/logging";

import { createArticleExtractor, createYouTubeExtractor, storeMarkdownBlob } from "./helpers";

export async function extractArticleImpl(
  ctx: ActionCtx,
  documentId: Id<"documents">,
  sourceUrl: string,
  evt: WideEvent,
) {
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

    const markdownStorageId = await storeMarkdownBlob(ctx, result.markdown);
    await ctx.scheduler.runAfter(0, internal.pipeline.chunking.chunkAndStore, {
      documentId,
      markdownStorageId,
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
  }
}

export async function extractYouTubeImpl(
  ctx: ActionCtx,
  documentId: Id<"documents">,
  sourceUrl: string,
  evt: WideEvent,
) {
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

    const markdownStorageId = await storeMarkdownBlob(ctx, result.markdown);
    await ctx.scheduler.runAfter(0, internal.pipeline.chunking.chunkAndStore, {
      documentId,
      markdownStorageId,
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
  }
}
