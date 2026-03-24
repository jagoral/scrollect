"use node";

import { generateText, Output } from "ai";
import { z } from "zod";

import type { CardDraftLlm, DraftCardType, TokenUsage } from "./types";
import { getAI } from "./ai";

const insightSchema = z.object({
  content: z
    .string()
    .min(50)
    .max(800)
    .describe(
      "2-4 sentences with a specific fact, surprising detail, or concrete example. Use **bold** for key terms.",
    ),
});

const quizSchema = z.object({
  content: z.string().min(20).max(800).describe("Brief description of what this quiz tests"),
  variant: z.enum(["multiple_choice", "true_false"]),
  question: z
    .string()
    .min(10)
    .describe("Question about concrete facts, names, or numbers from the source"),
  options: z
    .array(z.string().min(1))
    .min(2)
    .max(6)
    .describe("4 choices for multiple_choice, or ['True', 'False'] for true_false"),
  correctIndex: z.number().int().min(0).describe("0-based index of the correct option"),
  explanation: z.string().min(10).describe("Brief explanation referencing the exact source detail"),
});

const quoteSchema = z.object({
  content: z.string().min(20).max(800).describe("Brief context for the quote (1-2 sentences)"),
  quotedText: z
    .string()
    .min(10)
    .describe("Exact verbatim quote copied from the source chunks - do not paraphrase"),
  attribution: z.string().optional().describe("Author or source name if available"),
});

const summarySchema = z.object({
  content: z.string().min(20).max(800).describe("Brief overview of the section (1-2 sentences)"),
  bulletPoints: z
    .array(z.string().min(1))
    .min(2)
    .max(5)
    .describe(
      "Specific takeaways referencing concrete details - names, numbers, specific concepts",
    ),
});

const SCHEMAS: Record<DraftCardType, z.ZodSchema> = {
  insight: insightSchema,
  quiz: quizSchema,
  quote: quoteSchema,
  summary: summarySchema,
};

function buildSystemPrompt(cardType: DraftCardType): string {
  const base = `You are an AI learning assistant for Scrollect, a personal learning feed app.
Your job is to create a single focused learning card from a section of a document.

CONTENT PHILOSOPHY: Stay close to the source. Prefer exact wordings, specific facts, surprising details, and concrete examples over generic summaries or interpretations. The user wants to re-encounter the actual content they saved - not a paraphrased version.

LANGUAGE RULE: Write in the same language as the source chunks. If the chunks are in Polish, write in Polish. If in English, write in English. Never translate.`;

  switch (cardType) {
    case "insight":
      return `${base}

Create an INSIGHT card - a specific fact, surprising detail, or concrete example from the source.
- 2-4 sentences
- Use **bold** for key terms
- Prefer verbatim phrases and exact numbers/names from the text`;

    case "quiz":
      return `${base}

Create a QUIZ card testing recall of specific details from the source.
- Ask about concrete facts, names, numbers - not vague concepts
- Provide 4 options for multiple_choice or ["True", "False"] for true_false
- Include a brief explanation referencing the exact source detail`;

    case "quote":
      return `${base}

Create a QUOTE card - a notable, memorable, or thought-provoking passage from the source.
- Copy the quote VERBATIM from the source chunks - do not paraphrase
- Pick the most impactful or insightful passage
- Provide brief context (1-2 sentences) in the content field`;

    case "summary":
      return `${base}

Create a SUMMARY card with bullet points listing specific takeaways from the section.
- 2-5 bullet points, each referencing a concrete detail
- No abstract generalizations - include names, numbers, specific concepts
- Provide a brief overview (1-2 sentences) in the content field`;
  }
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

export class AiSdkCardDraftLlm implements CardDraftLlm {
  async generateDraft(opts: {
    cardType: DraftCardType;
    sectionSummary: string;
    sectionTitle: string;
    chunks: Array<{ content: string; chunkId: string }>;
    documentTitle: string;
  }): Promise<{
    card: { content: string; typeData: Record<string, unknown> };
    usage: TokenUsage;
  }> {
    const chunkText = opts.chunks.map((c, i) => `Chunk ${i}:\n${c.content}`).join("\n\n---\n\n");

    const prompt = `Document: "${opts.documentTitle}"
Section: "${opts.sectionTitle}"

Section summary: ${opts.sectionSummary}

Source chunks:
${chunkText}`;

    const schema = SCHEMAS[opts.cardType];
    const { output, usage } = await generateText({
      model: getAI().languageModel("fast"),
      output: Output.object({ schema }),
      system: buildSystemPrompt(opts.cardType),
      prompt,
      temperature: 0.4,
      maxRetries: 2,
    });

    const result = output ?? { content: "" };
    const content = (result as Record<string, unknown>).content as string;
    const typeData: Record<string, unknown> = { type: opts.cardType };

    switch (opts.cardType) {
      case "insight":
        break;
      case "quiz": {
        const q = result as z.infer<typeof quizSchema>;
        typeData.variant = q.variant ?? "multiple_choice";
        typeData.question = q.question;
        typeData.options = q.options;
        typeData.correctIndex = q.correctIndex;
        typeData.explanation = q.explanation;
        break;
      }
      case "quote": {
        const q = result as z.infer<typeof quoteSchema>;
        typeData.quotedText = q.quotedText;
        if (q.attribution) typeData.attribution = q.attribution;
        break;
      }
      case "summary": {
        const s = result as z.infer<typeof summarySchema>;
        typeData.bulletPoints = s.bulletPoints;
        break;
      }
    }

    return {
      card: { content, typeData },
      usage: normalizeUsage(usage),
    };
  }
}
