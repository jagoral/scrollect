"use node";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { WideEvent } from "../lib/logging";
import { captureEvent } from "../../src/providers/analytics";

import { storeMarkdownBlob } from "./helpers";
import { extractContentLogic } from "../../src/pipeline/logic/extraction";
import { createExtractionServiceContext } from "./services";

interface ExtractionArgs {
  ctx: ActionCtx;
  documentId: Id<"documents">;
  sourceUrl: string;
  userId: string;
  fileType: string;
  evt: WideEvent;
  extractorType: "article" | "youtube";
}

export async function extractContentImpl({
  ctx,
  documentId,
  sourceUrl,
  userId,
  fileType,
  evt,
  extractorType,
}: ExtractionArgs) {
  const startMs = Date.now();
  try {
    const doc = await ctx.runQuery(internal.documents.getInternal, { id: documentId });
    if (!doc) throw new Error(`Document ${documentId} not found`);
    if (doc.status === "deleting") return;

    const services = createExtractionServiceContext();
    const { result, metrics } = await extractContentLogic({
      input: { sourceUrl, extractorType },
      services,
    });

    evt.set({
      markdownLength: metrics.markdownLength,
      ...(metrics.provider ? { provider: metrics.provider } : {}),
    });

    if (result.title) {
      const thumbnailUrl =
        result.metadata?.thumbnailUrl && typeof result.metadata.thumbnailUrl === "string"
          ? result.metadata.thumbnailUrl
          : undefined;
      await ctx.runMutation(internal.documents.updateTitle, {
        id: documentId,
        title: result.title,
        thumbnailUrl,
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
    const message = error instanceof Error ? error.message : `${extractorType} extraction failed`;
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
        file_type: extractorType,
        error: message,
        duration_ms: Date.now() - startMs,
      },
    });
  }
}

export async function extractArticleImpl(args: Omit<ExtractionArgs, "extractorType">) {
  return extractContentImpl({ ...args, extractorType: "article" });
}

export async function extractYouTubeImpl(args: Omit<ExtractionArgs, "extractorType">) {
  return extractContentImpl({ ...args, extractorType: "youtube" });
}
