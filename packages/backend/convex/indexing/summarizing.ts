"use node";

import { v } from "convex/values";
import { sortBy } from "es-toolkit";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { internalAction } from "../_generated/server";
import { WideEvent } from "../../src/platform/logging";
import { normalizeUsage } from "../../src/providers/llm/models";
import { captureAiUsage, captureEvent } from "../../src/providers/analytics/posthog";

import { convexIdToUuid } from "../../src/platform/contentHash";
import { summarizeDocumentLogic } from "../../src/indexing/logic/summarizing";
import { createSummarizingServiceContext } from "./services";

export async function resumeSummarizing(ctx: ActionCtx, documentId: Id<"documents">) {
  await ctx.runMutation(internal.content.documents.updateStatus, {
    id: documentId,
    status: "summarizing",
  });
  await ctx.scheduler.runAfter(0, internal.indexing.summarizing.summarizeDocument, {
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
      | Awaited<ReturnType<typeof ctx.runQuery<typeof internal.content.documents.getInternal>>>
      | undefined;
    try {
      doc = await ctx.runQuery(internal.content.documents.getInternal, { id: documentId });
      if (!doc) throw new Error(`Document ${documentId} not found`);
      if (doc.status === "deleting") return;

      evt.set("userId", doc.userId);

      const allChunks = await ctx.runQuery(internal.content.chunks.listByDocumentInternal, {
        documentId,
      });
      evt.set("totalChunks", allChunks.length);

      if (allChunks.length === 0) {
        await ctx.runMutation(internal.content.documents.updateStatus, {
          id: documentId,
          status: "generating_cards",
        });
        await ctx.scheduler.runAfter(
          0,
          internal.drafting.postDraftGeneration.generateDraftsForDocument,
          { documentId },
        );
        return;
      }

      const sortedChunks = sortBy(allChunks, [(c) => c.chunkIndex]);

      const oldSections = await ctx.runQuery(internal.content.sectionSummaries.listByDocument, {
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
        await ctx.runMutation(internal.content.documents.updateStatus, {
          id: documentId,
          status: "generating_cards",
        });
        await ctx.scheduler.runAfter(
          0,
          internal.drafting.postDraftGeneration.generateDraftsForDocument,
          { documentId },
        );
        return;
      }

      evt.set(result.metrics);

      await ctx.runMutation(internal.content.sectionSummaries.deleteByDocument, { documentId });
      await ctx.runMutation(internal.content.sectionSummaries.createBatch, {
        documentId,
        summaries: result.sectionDbRecords,
      });

      await ctx.runMutation(internal.content.documents.updateStatus, {
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
        model: result.llmTokenUsage.modelId!,
      });
      if (result.embeddingUsage) {
        await captureAiUsage({
          distinctId: doc.userId,
          operation: "summarizing.embed",
          documentId,
          usage: normalizeUsage(
            {
              inputTokens: result.embeddingUsage.tokens,
              totalTokens: result.embeddingUsage.tokens,
            },
            "embedding",
          ),
          model: "embedding",
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
        internal.drafting.postDraftGeneration.generateDraftsForDocument,
        { documentId },
      );
    } catch (error) {
      evt.setError(error);
      const message = error instanceof Error ? error.message : "Summarization failed";
      await ctx.runMutation(internal.content.documents.updateStatus, {
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
          duration_ms: Date.now() - startMs,
        },
      });
    } finally {
      evt.emit();
    }
  },
});
