"use node";

import type OpenAI from "openai";
import { v } from "convex/values";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { internalAction } from "../_generated/server";
import { WideEvent } from "../lib/logging";
import { callOpenAIWithRetry, getOpenAIClient } from "../lib/openai";

import { convexIdToUuid, createEmbeddingProvider, createSummaryVectorStore } from "./helpers";
import {
  buildSummaryVectorPoints,
  groupChunksBySection,
  truncateSectionText,
} from "./summarizeLogic";

const SUMMARIZE_MODEL = "gpt-4o-mini";
const MAX_SECTION_CHUNKS_CHARS = 8000;

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

type SectionSummaryArgs = {
  openai: OpenAI;
  group: { sectionTitle: string; chunks: Array<{ content: string }> };
  evt: WideEvent;
};

async function generateSectionSummary(args: SectionSummaryArgs): Promise<string> {
  const { openai, group, evt } = args;
  const combinedText = truncateSectionText(group.chunks, MAX_SECTION_CHUNKS_CHARS);

  const raw = await callOpenAIWithRetry({
    openai,
    messages: [
      { role: "system", content: buildSectionSummaryPrompt() },
      {
        role: "user",
        content: `Section: "${group.sectionTitle}"\n\n${combinedText}`,
      },
    ],
    model: SUMMARIZE_MODEL,
    temperature: 0.3,
    evt,
  });

  try {
    const parsed = JSON.parse(raw);
    return typeof parsed.summary === "string" ? parsed.summary : "";
  } catch (error) {
    evt.set("sectionParseError", raw.substring(0, 500));
    evt.set("sectionParseErrorMessage", error instanceof Error ? error.message : String(error));
    return "";
  }
}

type DocSummaryArgs = {
  openai: OpenAI;
  sectionSummaries: Array<{ sectionTitle: string; summary: string }>;
  documentTitle: string;
  evt: WideEvent;
};

async function generateDocumentSummary(args: DocSummaryArgs): Promise<string> {
  const { openai, sectionSummaries, documentTitle, evt } = args;
  const userContent = sectionSummaries
    .map((s) => `Section "${s.sectionTitle}":\n${s.summary}`)
    .join("\n\n---\n\n");

  const raw = await callOpenAIWithRetry({
    openai,
    messages: [
      { role: "system", content: buildDocumentSummaryPrompt() },
      {
        role: "user",
        content: `Document: "${documentTitle}"\n\n${userContent}`,
      },
    ],
    model: SUMMARIZE_MODEL,
    temperature: 0.3,
    evt,
  });

  try {
    const parsed = JSON.parse(raw);
    return typeof parsed.summary === "string" ? parsed.summary : "";
  } catch (error) {
    evt.set("docParseError", raw.substring(0, 500));
    evt.set("docParseErrorMessage", error instanceof Error ? error.message : String(error));
    return "";
  }
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
    try {
      const doc = await ctx.runQuery(internal.documents.getInternal, { id: documentId });
      if (!doc) throw new Error(`Document ${documentId} not found`);
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

      const openai = getOpenAIClient();
      const embedder = createEmbeddingProvider();
      const summaryStore = createSummaryVectorStore();

      const sectionResults: Array<{
        sectionTitle: string;
        summary: string;
        chunkStartIndex: number;
        chunkEndIndex: number;
      }> = [];

      for (const group of groups) {
        const summary = await generateSectionSummary({ openai, group, evt });
        if (!summary) continue;

        const indices = group.chunks.map((c) => c.chunkIndex);
        sectionResults.push({
          sectionTitle: group.sectionTitle,
          summary,
          chunkStartIndex: Math.min(...indices),
          chunkEndIndex: Math.max(...indices),
        });
      }

      evt.set("sectionSummariesGenerated", sectionResults.length);

      if (sectionResults.length === 0) {
        await ctx.runMutation(internal.documents.updateStatus, {
          id: documentId,
          status: "ready",
        });
        await ctx.scheduler.runAfter(0, internal.pipeline.tagging.autoSuggest, { documentId });
        return;
      }

      const docSummary = await generateDocumentSummary({
        openai,
        sectionSummaries: sectionResults,
        documentTitle: doc.title,
        evt,
      });
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

      await ctx.runMutation(internal.documents.updateStatus, {
        id: documentId,
        status: "ready",
        summary: docSummary,
        summaryEmbeddingId: docEmbeddingId,
      });

      await summaryStore.upsert([docPoint, ...sectionPoints]);
      evt.set("vectorsUpserted", 1 + sectionPoints.length);

      await ctx.scheduler.runAfter(0, internal.pipeline.tagging.autoSuggest, { documentId });
    } catch (error) {
      evt.setError(error);
      const message = error instanceof Error ? error.message : "Summarization failed";
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
