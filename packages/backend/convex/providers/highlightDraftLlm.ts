"use node";

import { generateText, Output } from "ai";
import { z } from "zod";

import type { DraftCardType, HighlightDraftLlm, TokenUsage } from "./types";
import { getAI } from "./ai";

const highlightCardSchema = z.object({
  highlightId: z.string().describe("The ID of the highlight this card was generated from"),
  cardType: z
    .enum(["insight", "quiz", "quote", "summary"])
    .describe(
      "The best-fit card type for this highlight. Use 'quote' for short verbatim passages, 'insight' for conceptual or surprising details, 'quiz' for factual claims, 'summary' for dense passages with multiple takeaways.",
    ),
  content: z
    .string()
    .min(20)
    .max(800)
    .describe("The main card content - context or explanation (1-3 sentences)"),
  typeData: z
    .object({
      variant: z
        .enum(["multiple_choice", "true_false"])
        .nullable()
        .describe("Required for quiz cards"),
      question: z.string().nullable().describe("Required for quiz cards"),
      options: z.array(z.string()).nullable().describe("Required for quiz cards"),
      correctIndex: z.number().nullable().describe("Required for quiz cards"),
      explanation: z.string().nullable().describe("Required for quiz cards"),
      quotedText: z.string().nullable().describe("Required for quote cards - exact verbatim text"),
      attribution: z.string().nullable().describe("Optional for quote cards"),
      bulletPoints: z.array(z.string()).nullable().describe("Required for summary cards"),
    })
    .describe("Type-specific data matching the chosen cardType"),
});

const responseSchema = z.object({
  cards: z.array(highlightCardSchema),
});

// --- Prompt improvement notes (scorer impact) ---
// [CS] Added grounding: "the card content must directly reference the highlighted text"
//   Prevents generic summaries that ignore the actual highlight. Content Specificity scorer
//   penalizes content that could apply to any document.
// [TSQ] Added "prefer quote type when highlight is < 200 chars"
//   Short highlights are best as verbatim quotes. The quote quality scorer checks for exact
//   substring match - choosing quote type for short text raises this score.
// [LM] Added explicit "detect language from the source chunks first" step
//   Language Match scorer uses diacritics detection. Explicit language detection step
//   reduces mismatches on multilingual content.
// [SV] Added "you MUST include all required fields for the chosen type"
//   Structural Validity scorer calls castTypeData which throws on missing fields.
//   Emphasizing required fields reduces structural failures.

const SYSTEM_PROMPT = `You are an AI learning assistant for Scrollect, a personal learning feed app.
Your job is to create focused learning cards from highlighted passages in a document.

<instructions>
1. Detect the language of the source chunks. Write your entire response in that same language.
2. For each highlight, read it carefully and choose the best-fit card type.
3. The card content must directly reference the highlighted text - not generic section summaries.
</instructions>

<card_type_selection>
- "quote" - for short passages (under ~200 characters), memorable, or thought-provoking text. Copy the highlight text verbatim as quotedText, character by character.
- "insight" - for conceptual passages, surprising details, or concrete examples. Write 2-4 sentences grounding the insight in the highlighted text. Use **bold** for key terms.
- "quiz" - for factual claims, specific numbers, or testable knowledge. Create a question about a concrete fact from the highlighted text. All wrong options must be plausible.
- "summary" - for dense passages with multiple distinct takeaways. Extract 2-5 bullet points, each containing at least one specific name, number, or term from the highlight.
</card_type_selection>

<type_data_requirements>
You MUST include all required fields for the chosen card type:
- insight: no extra fields needed
- quiz: variant ("multiple_choice" or "true_false"), question, options (4 for MC, ["True","False"] for TF), correctIndex (0-based), explanation (must reference the source)
- quote: quotedText (exact verbatim text from source - not paraphrased), attribution (optional)
- summary: bulletPoints (2-5 specific takeaways with concrete details)
</type_data_requirements>

<avoid>
- Generic content like "this passage highlights an important aspect of..."
- Paraphrasing the highlight instead of using its actual words
- Quiz questions that are vague or have obviously wrong options
</avoid>

Return exactly one card per highlight. Use the same highlightId from the input.`;

function buildUserPrompt(opts: {
  highlights: Array<{ highlightId: string; highlightText: string }>;
  sectionSummary: string;
  sectionTitle: string;
  chunks: Array<{ content: string; chunkId: string }>;
  documentTitle: string;
}): string {
  const chunkText = opts.chunks.map((c, i) => `Chunk ${i}:\n${c.content}`).join("\n\n---\n\n");
  const highlightList = opts.highlights
    .map((h) => `- [${h.highlightId}]: "${h.highlightText}"`)
    .join("\n");

  return `Document: "${opts.documentTitle}"
Section: "${opts.sectionTitle}"

Section summary: ${opts.sectionSummary}

Source chunks:
${chunkText}

Highlighted passages to generate cards from:
${highlightList}

Generate exactly one learning card per highlight. Return the cards array with the matching highlightId for each.`;
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

export class AiSdkHighlightDraftLlm implements HighlightDraftLlm {
  async generateDraftsFromHighlights(opts: {
    highlights: Array<{ highlightId: string; highlightText: string }>;
    sectionSummary: string;
    sectionTitle: string;
    chunks: Array<{ content: string; chunkId: string }>;
    documentTitle: string;
  }): Promise<{
    cards: Array<{
      highlightId: string;
      content: string;
      cardType: DraftCardType;
      typeData: Record<string, unknown>;
    }>;
    usage: TokenUsage;
  }> {
    const prompt = buildUserPrompt(opts);

    const { output, usage } = await generateText({
      model: getAI().languageModel("fast"),
      output: Output.object({ schema: responseSchema }),
      system: SYSTEM_PROMPT,
      prompt,
      temperature: 0.4,
      maxRetries: 2,
    });

    const result = output ?? { cards: [] };

    const cards = result.cards.map((card) => {
      const typeData: Record<string, unknown> = { type: card.cardType };

      switch (card.cardType) {
        case "quiz": {
          typeData.variant = card.typeData.variant ?? "multiple_choice";
          typeData.question = card.typeData.question;
          typeData.options = card.typeData.options;
          typeData.correctIndex = card.typeData.correctIndex;
          typeData.explanation = card.typeData.explanation;
          break;
        }
        case "quote": {
          typeData.quotedText = card.typeData.quotedText;
          if (card.typeData.attribution) typeData.attribution = card.typeData.attribution;
          break;
        }
        case "summary": {
          typeData.bulletPoints = card.typeData.bulletPoints;
          break;
        }
        case "insight":
          break;
      }

      return {
        highlightId: card.highlightId,
        content: card.content,
        cardType: card.cardType as DraftCardType,
        typeData,
      };
    });

    return { cards, usage: normalizeUsage(usage) };
  }
}
