"use node";

import { generateText, Output } from "ai";
import { v } from "convex/values";
import { z } from "zod";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { internalAction } from "../_generated/server";
import { WideEvent } from "../lib/logging";
import { captureAiUsage, captureEvent } from "../providers/analytics";
import { getAI } from "../providers/ai";

import { convexIdToUuid, createEmbeddingProvider, createSummaryVectorStore } from "./helpers";
import {
  buildSummaryVectorPoints,
  groupChunksBySection,
  truncateSectionText,
} from "./summarizeLogic";

const MAX_SECTION_CHUNKS_CHARS = 8000;

const summarySchema = z.object({ summary: z.string() });

function buildSectionSummaryPrompt(): string {
  return `You are a summarization assistant for a personal learning app.
Given text chunks from a section of a document, produce a concise summary that captures the key ideas, concepts, and insights.

Rules:
- Write 2-5 sentences
- Capture the main concepts and their relationships
- Be specific — include key terms, names, and numbers
- Write in third person

Return a JSON object: { "summary": "..." }`;
}

function buildDocumentSummaryPrompt(): string {
  return `You are a summarization assistant for a personal learning app.
Given section summaries from a document, produce a document-level summary that captures the overall theme and key takeaways.

Rules:
- Write 3-6 sentences
- Capture the document's main thesis and key arguments
- Mention the most important concepts across sections
- Write in third person

Return a JSON object: { "summary": "..." }`;
}

type TokenUsage = { inputTokens: number; outputTokens: number; totalTokens: number };

async function generateSectionSummary(group: {
  sectionTitle: string;
  chunks: Array<{ content: string }>;
}): Promise<{ summary: string; usage: TokenUsage }> {
  const combinedText = truncateSectionText(group.chunks, MAX_SECTION_CHUNKS_CHARS);

  const { output, usage } = await generateText({
    model: getAI().languageModel("fast"),
    output: Output.object({ schema: summarySchema }),
    system: buildSectionSummaryPrompt(),
    prompt: `Section: "${group.sectionTitle}"\n\n${combinedText}`,
    temperature: 0.3,
    maxRetries: 2,
  });

  return {
    summary: output?.summary ?? "",
    usage: {
      inputTokens: usage.inputTokens ?? 0,
      outputTokens: usage.outputTokens ?? 0,
      totalTokens: usage.totalTokens ?? 0,
    },
  };
}

type DocSummaryArgs = {
  sectionSummaries: Array<{ sectionTitle: string; summary: string }>;
  documentTitle: string;
};

async function generateDocumentSummary(
  args: DocSummaryArgs,
): Promise<{ summary: string; usage: TokenUsage }> {
  const { sectionSummaries, documentTitle } = args;
  const userContent = sectionSummaries
    .map((s) => `Section "${s.sectionTitle}":\n${s.summary}`)
    .join("\n\n---\n\n");

  const { output, usage } = await generateText({
    model: getAI().languageModel("fast"),
    output: Output.object({ schema: summarySchema }),
    system: buildDocumentSummaryPrompt(),
    prompt: `Document: "${documentTitle}"\n\n${userContent}`,
    temperature: 0.3,
    maxRetries: 2,
  });

  return {
    summary: output?.summary ?? "",
    usage: {
      inputTokens: usage.inputTokens ?? 0,
      outputTokens: usage.outputTokens ?? 0,
      totalTokens: usage.totalTokens ?? 0,
    },
  };
}

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
  handler: async (ctx, { documentId }) => {
    const evt = new WideEvent("pipeline.summarizeDocument");
    evt.set({ documentId });
    const startMs = Date.now();
    const doc = await ctx.runQuery(internal.documents.getInternal, { id: documentId });
    if (!doc) throw new Error(`Document ${documentId} not found`);
    if (doc.status === "deleting") return;
    try {
      evt.set("userId", doc.userId);

      const allChunks = await ctx.runQuery(internal.chunks.listByDocumentInternal, {
        documentId,
      });
      evt.set("totalChunks", allChunks.length);

      if (allChunks.length === 0) {
        await ctx.runMutation(internal.documents.updateStatus, {
          id: documentId,
          status: "ready",
        });
        await ctx.scheduler.runAfter(0, internal.pipeline.tagging.autoSuggest, { documentId });
        return;
      }

      const sortedChunks = [...allChunks].sort((a, b) => a.chunkIndex - b.chunkIndex);
      const groups = groupChunksBySection(sortedChunks);
      evt.set("sectionGroups", groups.length);

      const embedder = createEmbeddingProvider();
      const summaryStore = createSummaryVectorStore();

      const sectionCandidates = await Promise.all(
        groups.map(async (group) => {
          const { summary, usage } = await generateSectionSummary(group);
          if (!summary) return null;

          const indices = group.chunks.map((c) => c.chunkIndex);
          return {
            sectionTitle: group.sectionTitle,
            summary,
            chunkStartIndex: Math.min(...indices),
            chunkEndIndex: Math.max(...indices),
            usage,
          };
        }),
      );
      const sectionResults = sectionCandidates.filter(
        (r): r is NonNullable<typeof r> => r !== null,
      );

      const llmTokens = sectionResults.reduce(
        (acc, r) => ({
          inputTokens: acc.inputTokens + r.usage.inputTokens,
          outputTokens: acc.outputTokens + r.usage.outputTokens,
          totalTokens: acc.totalTokens + r.usage.totalTokens,
        }),
        { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      );

      evt.set("sectionSummariesGenerated", sectionResults.length);

      if (sectionResults.length === 0) {
        await ctx.runMutation(internal.documents.updateStatus, {
          id: documentId,
          status: "ready",
        });
        await ctx.scheduler.runAfter(0, internal.pipeline.tagging.autoSuggest, { documentId });
        return;
      }

      const { summary: docSummary, usage: docSummaryUsage } = await generateDocumentSummary({
        sectionSummaries: sectionResults,
        documentTitle: doc.title,
      });
      llmTokens.inputTokens += docSummaryUsage.inputTokens;
      llmTokens.outputTokens += docSummaryUsage.outputTokens;
      llmTokens.totalTokens += docSummaryUsage.totalTokens;
      evt.set("docSummaryLength", docSummary.length);

      const allTexts = [docSummary, ...sectionResults.map((s) => s.summary)];
      const allVectors = await embedder.embed(allTexts);

      const { docPoint, docEmbeddingId, sectionPoints, sectionDbRecords } =
        buildSummaryVectorPoints({
          documentId: documentId as string,
          userId: doc.userId,
          docSummary,
          sectionResults,
          vectors: allVectors,
          idToUuid: convexIdToUuid,
        });

      const oldSections = await ctx.runQuery(internal.sectionSummaries.listByDocument, {
        documentId,
      });
      const staleVectorIds = oldSections.map((s) => s.embeddingId);
      if (doc.summaryEmbeddingId) {
        staleVectorIds.push(doc.summaryEmbeddingId);
      }
      await summaryStore.delete(staleVectorIds);
      evt.set("staleVectorsDeleted", staleVectorIds.length);

      await ctx.runMutation(internal.sectionSummaries.deleteByDocument, { documentId });
      await ctx.runMutation(internal.sectionSummaries.createBatch, {
        documentId,
        summaries: sectionDbRecords,
      });

      const upsertStart = Date.now();
      await summaryStore.upsert([docPoint, ...sectionPoints]);
      evt.set("upsertDurationMs", Date.now() - upsertStart);
      evt.set("vectorsUpserted", 1 + sectionPoints.length);

      captureAiUsage({
        distinctId: doc.userId,
        operation: "summarizing",
        documentId,
        usage: llmTokens,
        model: "llm",
      });
      if (embedder.lastUsage) {
        captureAiUsage({
          distinctId: doc.userId,
          operation: "summarizing.embed",
          documentId,
          usage: embedder.lastUsage,
          model: "embedding",
        });
      }
      captureEvent({
        distinctId: doc.userId,
        event: "pipeline.stage_completed",
        properties: {
          stage: "summarizing",
          document_id: documentId,
          duration_ms: Date.now() - startMs,
        },
      });

      await ctx.runMutation(internal.documents.updateStatus, {
        id: documentId,
        status: "ready",
        summary: docSummary,
        summaryEmbeddingId: docEmbeddingId,
      });

      await ctx.scheduler.runAfter(0, internal.pipeline.tagging.autoSuggest, { documentId });
    } catch (error) {
      evt.setError(error);
      const message = error instanceof Error ? error.message : "Summarization failed";
      captureEvent({
        distinctId: doc.userId,
        event: "pipeline.stage_failed",
        properties: {
          stage: "summarizing",
          document_id: documentId,
          error: message,
        },
      });
      await ctx.runMutation(internal.documents.updateStatus, {
        id: documentId,
        status: "error",
        errorMessage: message,
        failedAt: "summarizing",
      });
    } finally {
      evt.emit();
    }
  },
});
