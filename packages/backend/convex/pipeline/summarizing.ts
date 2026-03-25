"use node";

import { v } from "convex/values";
import { sortBy } from "es-toolkit";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { internalAction } from "../_generated/server";
import { WideEvent } from "../lib/logging";
import { captureAiUsage, captureEvent } from "../providers/analytics";

import { convexIdToUuid } from "./helpers";
import { summarizeDocumentLogic } from "./logic/summarizing";
import { createSummarizingServiceContext } from "./services";

export async function resumeSummarizing(ctx: ActionCtx, documentId: Id<"documents">) {
  await ctx.runMutation(internal.documents.updateStatus, {
    id: documentId,
    status: "summarizing",
  });
  await ctx.scheduler.runAfter(0, internal.pipeline.summarizing.summarizeDocument, {
    documentId,
  });
}

export const summarizeDocument = internalAction({
  args: { documentId: v.id("documents") },
  returns: v.null(),
  handler: async (ctx, { documentId }) => {
    const evt = new WideEvent("pipeline.summarizeDocument");
    evt.set({ documentId });
    const startMs = Date.now();
    let doc:
      | Awaited<ReturnType<typeof ctx.runQuery<typeof internal.documents.getInternal>>>
      | undefined;
    try {
      doc = await ctx.runQuery(internal.documents.getInternal, { id: documentId });
      if (!doc) throw new Error(`Document ${documentId} not found`);
      if (doc.status === "deleting") return;

      evt.set("userId", doc.userId);

      const allChunks = await ctx.runQuery(internal.chunks.listByDocumentInternal, {
        documentId,
      });
      evt.set("totalChunks", allChunks.length);

      if (allChunks.length === 0) {
        await ctx.runMutation(internal.documents.updateStatus, {
          id: documentId,
          status: "generating_cards",
        });
        await ctx.scheduler.runAfter(
          0,
          internal.pipeline.cardDraftGeneration.generateDraftsForDocument,
          { documentId },
        );
        return;
      }

      const sortedChunks = sortBy(allChunks, [(c) => c.chunkIndex]);

      const oldSections = await ctx.runQuery(internal.sectionSummaries.listByDocument, {
        documentId,
      });
      const staleVectorIds = oldSections.map((s) => s.embeddingId);
      if (doc.summaryEmbeddingId) {
        staleVectorIds.push(doc.summaryEmbeddingId);
      }

      const services = createSummarizingServiceContext();
      const result = await summarizeDocumentLogic({
        input: {
          documentId,
          userId: doc.userId,
          documentTitle: doc.title,
          language: doc.language,
          chunks: sortedChunks,
          staleVectorIds,
          idToUuid: convexIdToUuid,
        },
        services,
      });

      if (!result) {
        await ctx.runMutation(internal.documents.updateStatus, {
          id: documentId,
          status: "generating_cards",
        });
        await ctx.scheduler.runAfter(
          0,
          internal.pipeline.cardDraftGeneration.generateDraftsForDocument,
          { documentId },
        );
        return;
      }

      evt.set(result.metrics);

      await ctx.runMutation(internal.sectionSummaries.deleteByDocument, { documentId });
      await ctx.runMutation(internal.sectionSummaries.createBatch, {
        documentId,
        summaries: result.sectionDbRecords,
      });

      await ctx.runMutation(internal.documents.updateStatus, {
        id: documentId,
        status: "generating_cards",
        summary: result.docSummary,
        summaryEmbeddingId: result.docEmbeddingId,
      });

      await captureAiUsage({
        distinctId: doc.userId,
        operation: "summarizing",
        documentId,
        usage: result.llmTokenUsage,
        modelType: "llm",
      });
      if (result.embeddingUsage) {
        await captureAiUsage({
          distinctId: doc.userId,
          operation: "summarizing.embed",
          documentId,
          usage: result.embeddingUsage,
          modelType: "embedding",
        });
      }
      await captureEvent({
        distinctId: doc.userId,
        event: "pipeline.stage_completed",
        properties: {
          stage: "summarizing",
          document_id: documentId,
          duration_ms: Date.now() - startMs,
        },
      });

      await ctx.scheduler.runAfter(
        0,
        internal.pipeline.cardDraftGeneration.generateDraftsForDocument,
        { documentId },
      );
    } catch (error) {
      evt.setError(error);
      const message = error instanceof Error ? error.message : "Summarization failed";
      await ctx.runMutation(internal.documents.updateStatus, {
        id: documentId,
        status: "error",
        errorMessage: message,
        failedAt: "summarizing",
      });
      await captureEvent({
        distinctId: doc?.userId ?? `unresolved:${documentId}`,
        event: "pipeline.stage_failed",
        properties: {
          stage: "summarizing",
          document_id: documentId,
          error: message,
        },
      });
    } finally {
      evt.emit();
    }
  },
});
