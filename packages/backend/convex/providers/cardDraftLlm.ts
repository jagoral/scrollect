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
  attribution: z.string().nullable().describe("Author or source name if available"),
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

<instructions>
1. First, detect the language of the source chunks. Write your entire response in that same language. If chunks are in Polish, write in Polish. If in English, write in English. Never translate or mix languages.
2. Before writing, identify 2-3 specific details from the source: exact names, numbers, dates, or notable phrases you will reference in the card.
3. Create the card using those specific details. Stay close to the source text.
</instructions>

<quality_rules>
- Prefer exact wordings, specific facts, and concrete examples over generic summaries
- The user wants to re-encounter the actual content they saved, not a paraphrased version
- Every sentence must reference something specific from the source chunks
</quality_rules>

<avoid>
- "This section discusses important concepts about..."
- "The author explores various aspects of..."
- "There are several key factors that..."
- Any sentence that could apply to a different document without changes
</avoid>`;

  switch (cardType) {
    case "insight":
      return `${base}

<task>Create an INSIGHT card - a specific fact, surprising detail, or concrete example from the source.</task>

<format>
- 2-4 sentences
- Use **bold** for key terms (names, technical terms, numbers)
- Include at least one direct phrase from the source text
- The first sentence must contain a specific fact, not a general introduction
</format>`;

    case "quiz":
      return `${base}

<task>Create a QUIZ card testing recall of a specific detail from the source.</task>

<format>
- The question must target a concrete, verifiable fact (a name, number, date, or specific claim)
- For multiple_choice: provide exactly 4 options where all wrong options are plausible but clearly incorrect based on the source
- For true_false: the statement must be specific enough that the answer is unambiguous
- The explanation must quote or closely reference the exact source passage that contains the answer
</format>`;

    case "quote":
      return `${base}

<task>Create a QUOTE card featuring a notable passage from the source.</task>

<format>
- Search the source chunks for the most impactful, memorable, or thought-provoking passage
- Copy the passage exactly as it appears in the source, character by character - do not paraphrase, rephrase, or clean up the text
- The quotedText must be a verbatim substring of one of the source chunks
- In the content field, provide 1-2 sentences of context explaining why this quote matters
</format>`;

    case "summary":
      return `${base}

<task>Create a SUMMARY card with bullet points listing specific takeaways from the section.</task>

<format>
- 2-5 bullet points, each containing at least one proper noun, number, or technical term from the source
- Each bullet must reference a distinct, concrete detail - not a rewording of another bullet
- In the content field, provide a 1-2 sentence overview that names the specific topic (not "this section covers key ideas")
</format>`;
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
      model: getAI().languageModel("generate"),
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
