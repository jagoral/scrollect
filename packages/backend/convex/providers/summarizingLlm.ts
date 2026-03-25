"use node";

import { generateText, Output } from "ai";
import { z } from "zod";

import type { SummarizingLlm, TokenUsage } from "./types";
import { getAI } from "./ai";

const summarySchema = z.object({ summary: z.string() });

function buildSectionSummaryPrompt(): string {
  return `You are a summarization assistant for a personal learning app.
Given text chunks from a section of a document, produce a concise summary that captures the key ideas, concepts, and insights.

Rules:
- Write 2-5 sentences
- Capture the main concepts and their relationships
- Be specific - include key terms, names, and numbers
- Write in third person
- Always write in English, even if the source text is in another language

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
- Always write in English, even if the source text is in another language

Return a JSON object: { "summary": "..." }`;
}

function normalizeUsage(usage: {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}): TokenUsage {
  return {
    inputTokens: usage.inputTokens ?? 0,
    outputTokens: usage.outputTokens ?? 0,
    totalTokens: usage.totalTokens ?? 0,
  };
}

export class AiSdkSummarizingLlm implements SummarizingLlm {
  async generateSectionSummary(opts: {
    sectionTitle: string;
    combinedText: string;
  }): Promise<{ summary: string; usage: TokenUsage }> {
    const { output, usage } = await generateText({
      model: getAI().languageModel("generate"),
      output: Output.object({ schema: summarySchema }),
      system: buildSectionSummaryPrompt(),
      prompt: `Section: "${opts.sectionTitle}"\n\n${opts.combinedText}`,
      temperature: 0.3,
      maxRetries: 2,
    });

    return {
      summary: output?.summary ?? "",
      usage: normalizeUsage(usage),
    };
  }

  async generateDocumentSummary(opts: {
    sectionSummaries: Array<{ sectionTitle: string; summary: string }>;
    documentTitle: string;
  }): Promise<{ summary: string; usage: TokenUsage }> {
    const userContent = opts.sectionSummaries
      .map((s) => `Section "${s.sectionTitle}":\n${s.summary}`)
      .join("\n\n---\n\n");

    const { output, usage } = await generateText({
      model: getAI().languageModel("generate"),
      output: Output.object({ schema: summarySchema }),
      system: buildDocumentSummaryPrompt(),
      prompt: `Document: "${opts.documentTitle}"\n\n${userContent}`,
      temperature: 0.3,
      maxRetries: 2,
    });

    return {
      summary: output?.summary ?? "",
      usage: normalizeUsage(usage),
    };
  }
}
