"use node";

import { v } from "convex/values";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { internalAction } from "../_generated/server";
import { chunkMarkdown } from "../../src/indexing/chunking";
import {
  cleanDocumentTitle,
  firstChunkTitleContext,
} from "../../src/indexing/logic/documentMetadata";
import { WideEvent } from "../../src/platform/logging";
import { captureAiUsage, captureEvent } from "../../src/providers/analytics/posthog";

import { fanOutEmbedding } from "./embedding";
import { CHUNK_STORE_BATCH_SIZE, fetchMarkdownBlob } from "./helpers";
import { detectLanguage } from "../../src/indexing/languageDetection";
import { createDocumentMetadataServiceContext } from "./services";

export const chunkAndStore = internalAction({
  args: {
    documentId: v.id("documents"),
    markdownStorageId: v.id("_storage"),
    inferTitle: v.optional(v.boolean()),
  },
  handler: async (ctx, { documentId, markdownStorageId, inferTitle }) => {
    const evt = new WideEvent("pipeline.chunkAndStore");
    evt.set({ documentId, markdownStorageId });
    const startMs = Date.now();
    let doc:
      | Awaited<ReturnType<typeof ctx.runQuery<typeof internal.documents.getInternal>>>
      | undefined;
    try {
      doc = await ctx.runQuery(internal.documents.getInternal, { id: documentId });
      if (!doc) throw new Error(`Document ${documentId} not found`);
      if (doc.status === "deleting") return;

      const markdown = await fetchMarkdownBlob(ctx, markdownStorageId);
      evt.set("markdownLength", markdown.length);

      await ctx.runMutation(internal.documents.updateStatus, {
        id: documentId,
        status: "chunking",
      });

      const rawChunks = chunkMarkdown(markdown);
      const chunks = rawChunks.map((c, i) => ({
        content: c.content,
        chunkIndex: i,
        tokenCount: c.tokenCount,
        sectionTitle: c.sectionTitle,
        pageNumber: c.pageNumber,
      }));

      evt.set("chunkCount", chunks.length);

      const allChunkIds: Id<"chunks">[] = [];
      let batchesStored = 0;
      for (let i = 0; i < chunks.length; i += CHUNK_STORE_BATCH_SIZE) {
        const batch = chunks.slice(i, i + CHUNK_STORE_BATCH_SIZE);
        const ids = await ctx.runMutation(internal.chunks.createBatch, {
          documentId,
          chunks: batch,
        });
        allChunkIds.push(...ids);
        batchesStored++;
      }
      evt.set("batchesStored", batchesStored);

      const language = await detectLanguage(markdown);
      evt.set("detectedLanguage", language);

      if (inferTitle && chunks[0]) {
        await inferDocumentTitleFromFirstChunk({
          ctx,
          documentId,
          currentTitle: doc.title,
          firstChunk: chunks[0].content,
          fileType: doc.fileType,
          language,
          userId: doc.userId,
          evt,
        });
      }

      await ctx.runMutation(internal.documents.updateStatus, {
        id: documentId,
        status: "embedding",
        chunkCount: chunks.length,
        language,
      });

      await captureEvent({
        distinctId: doc.userId,
        event: "pipeline.stage_completed",
        properties: {
          stage: "chunking",
          document_id: documentId,
          chunk_count: chunks.length,
          duration_ms: Date.now() - startMs,
        },
      });

      // Fan-out embedding batches
      await fanOutEmbedding(ctx, documentId, allChunkIds);
    } catch (error) {
      evt.setError(error);
      const message = error instanceof Error ? error.message : "Chunking failed";
      await ctx.runMutation(internal.documents.updateStatus, {
        id: documentId,
        status: "error",
        errorMessage: message,
        failedAt: "chunking",
      });
      await captureEvent({
        distinctId: doc?.userId ?? `unresolved:${documentId}`,
        event: "pipeline.stage_failed",
        properties: {
          stage: "chunking",
          document_id: documentId,
          error: message,
          duration_ms: Date.now() - startMs,
        },
      });
    } finally {
      evt.emit();
    }
  },
});

async function inferDocumentTitleFromFirstChunk(opts: {
  ctx: ActionCtx;
  documentId: Id<"documents">;
  currentTitle: string;
  firstChunk: string;
  fileType: string;
  language?: string;
  userId: string;
  evt: WideEvent;
}) {
  try {
    const services = createDocumentMetadataServiceContext();
    const result = await services.llm.inferTitle({
      titleContext: firstChunkTitleContext(opts.firstChunk),
      currentTitle: opts.currentTitle,
      fileType: opts.fileType,
      language: opts.language,
    });

    const cleanedTitle = cleanDocumentTitle(result.title);
    if (cleanedTitle && cleanedTitle !== opts.currentTitle) {
      await opts.ctx.runMutation(internal.documents.updateMetadata, {
        id: opts.documentId,
        title: cleanedTitle,
      });
      opts.evt.set("inferredTitle", true);
    } else {
      opts.evt.set("inferredTitle", false);
    }

    if (result.usage.modelId) {
      await captureAiUsage({
        distinctId: opts.userId,
        operation: "document_title_inference",
        usage: result.usage,
        model: result.usage.modelId,
        documentId: opts.documentId,
      });
    }
  } catch (error) {
    opts.evt.set({
      titleInferenceError: error instanceof Error ? error.message : String(error),
    });
  }
}
