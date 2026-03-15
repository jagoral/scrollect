"use node";

import OpenAI from "openai";
import { v } from "convex/values";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { internalAction } from "../_generated/server";
import { WideEvent } from "../lib/logging";

import { convexIdToUuid, createEmbeddingProvider, createSummaryVectorStore } from "./helpers";
import {
  buildSummaryVectorPoints,
  groupChunksBySection,
  truncateSectionText,
} from "./summarizeLogic";

const SUMMARIZE_MODEL = "gpt-4o-mini";
const MAX_SECTION_CHUNKS_CHARS = 8000;
const MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 2000;

function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY environment variable is required");
  return new OpenAI({ apiKey });
}

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

async function callWithRetry(
  openai: OpenAI,
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  evt: WideEvent,
): Promise<string> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await openai.chat.completions.create({
        model: SUMMARIZE_MODEL,
        messages,
        temperature: 0.3,
        response_format: { type: "json_object" },
      });
      return response.choices[0]?.message?.content ?? "{}";
    } catch (error: unknown) {
      const status = (error as { status?: number }).status ?? 0;
      const isRetryable =
        error instanceof Error &&
        (error.message.includes("rate_limit") ||
          error.message.includes("timeout") ||
          status === 429 ||
          status >= 500);

      if (!isRetryable || attempt === MAX_RETRIES) throw error;

      const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
      evt.set(`retry_${attempt}`, delay);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw new Error("Exhausted retries");
}

async function generateSectionSummary(
  openai: OpenAI,
  group: { sectionTitle: string; chunks: Array<{ content: string }> },
  evt: WideEvent,
): Promise<string> {
  const combinedText = truncateSectionText(group.chunks, MAX_SECTION_CHUNKS_CHARS);

  const raw = await callWithRetry(
    openai,
    [
      { role: "system", content: buildSectionSummaryPrompt() },
      {
        role: "user",
        content: `Section: "${group.sectionTitle}"\n\n${combinedText}`,
      },
    ],
    evt,
  );

  const parsed = JSON.parse(raw);
  return typeof parsed.summary === "string" ? parsed.summary : "";
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

  const raw = await callWithRetry(
    openai,
    [
      { role: "system", content: buildDocumentSummaryPrompt() },
      {
        role: "user",
        content: `Document: "${documentTitle}"\n\n${userContent}`,
      },
    ],
    evt,
  );

  const parsed = JSON.parse(raw);
  return typeof parsed.summary === "string" ? parsed.summary : "";
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
        const summary = await generateSectionSummary(openai, group, evt);
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

      await summaryStore.upsert([docPoint, ...sectionPoints]);
      evt.set("vectorsUpserted", 1 + sectionPoints.length);

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
