import { z } from "zod";

import type { SummarizingLlm } from "../types";
import { type TokenUsage, generate } from "./models";
import { buildLanguageInstruction } from "./promptUtils";

const sectionSummarySchema = z.object({
  summary: z.string(),
  isSubstantiveContent: z.boolean(),
});

const docSummarySchema = z.object({ summary: z.string() });

function buildSectionSummaryPrompt(language?: string): string {
  return `You are a summarization assistant for a personal learning app.
Given text chunks from a section of a document, produce a concise summary and classify whether the section contains substantive learning content.

Rules:
- Write 2-5 sentences
- Capture the main concepts and their relationships
- Be specific - include key terms, names, and numbers
- Write in third person
- ${buildLanguageInstruction(language)}
- Set "isSubstantiveContent" to true for chapters and sections with concepts, arguments, narrative, or educational value
- Set "isSubstantiveContent" to false for: table of contents, bibliography, references, copyright notices, title pages, acknowledgments, ads, sponsor pages, publisher letters, bookstore promotions, appendices listing only names/links
- When in doubt, classify as substantive (true)

Return a JSON object: { "summary": "...", "isSubstantiveContent": true/false }`;
}

function buildDocumentSummaryPrompt(language?: string): string {
  return `You are a summarization assistant for a personal learning app.
Given section summaries from a document, produce a document-level summary that captures the overall theme and key takeaways.

Rules:
- Write 3-6 sentences
- Capture the document's main thesis and key arguments
- Mention the most important concepts across sections
- Write in third person
- ${buildLanguageInstruction(language)}

Return a JSON object: { "summary": "..." }`;
}

export class AiSdkSummarizingLlm implements SummarizingLlm {
  async generateSectionSummary(opts: {
    sectionTitle: string;
    combinedText: string;
    language?: string;
  }): Promise<{ summary: string; isSubstantiveContent: boolean; usage: TokenUsage }> {
    const { output, usage } = await generate({
      model: "generate",
      schema: sectionSummarySchema,
      system: buildSectionSummaryPrompt(opts.language),
      prompt: `Section: "${opts.sectionTitle}"\n\n${opts.combinedText}`,
      temperature: 0.3,
    });

    return {
      summary: output?.summary ?? "",
      isSubstantiveContent: output?.isSubstantiveContent ?? true,
      usage,
    };
  }

  async generateDocumentSummary(opts: {
    sectionSummaries: Array<{ sectionTitle: string; summary: string }>;
    documentTitle: string;
    language?: string;
  }): Promise<{ summary: string; usage: TokenUsage }> {
    const userContent = opts.sectionSummaries
      .map((s) => `Section "${s.sectionTitle}":\n${s.summary}`)
      .join("\n\n---\n\n");

    const { output, usage } = await generate({
      model: "generate",
      schema: docSummarySchema,
      system: buildDocumentSummaryPrompt(opts.language),
      prompt: `Document: "${opts.documentTitle}"\n\n${userContent}`,
      temperature: 0.3,
    });

    return {
      summary: output?.summary ?? "",
      usage,
    };
  }
}
