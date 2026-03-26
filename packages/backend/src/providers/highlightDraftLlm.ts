import { generateText, Output } from "ai";
import { z } from "zod";

import type { DraftCardType, HighlightDraftLlm, TokenUsage } from "./types";
import { getAI } from "./ai";
import { buildLanguageInstruction } from "./promptUtils";

const classificationSchema = z.object({
  classifications: z.array(
    z.object({
      highlightId: z.string().describe("The highlight ID from the input"),
      cardType: z
        .enum(["insight", "quiz", "quote", "summary"])
        .describe("The best-fit card type for this highlight"),
    }),
  ),
});

const insightSchema = z.object({
  content: z
    .string()
    .min(50)
    .max(800)
    .describe(
      "2-4 sentences grounding the insight in the highlighted text. Use **bold** for key terms. Include specific names, numbers, or facts from the source.",
    ),
});

const quizSchema = z.object({
  content: z
    .string()
    .min(20)
    .max(800)
    .describe(
      "1-2 sentences providing context for the quiz using specific details from the source",
    ),
  variant: z.enum(["multiple_choice", "true_false"]),
  question: z
    .string()
    .min(10)
    .describe("Question targeting a concrete verifiable fact from the highlighted text"),
  options: z
    .array(z.string().min(1))
    .min(2)
    .max(6)
    .describe("4 plausible choices for MC, or ['True', 'False'] for TF"),
  correctIndex: z.number().int().min(0).describe("0-based index of the correct option"),
  explanation: z
    .string()
    .min(10)
    .describe("Brief explanation citing the exact source detail that contains the answer"),
});

const quoteSchema = z.object({
  content: z
    .string()
    .min(20)
    .max(800)
    .describe(
      "1-2 sentences explaining WHO said/wrote this, in what CONTEXT, and WHY it matters. Use specific names and events from the source chunks.",
    ),
  quotedText: z
    .string()
    .min(10)
    .describe("The EXACT highlight text copied character-for-character - do not paraphrase"),
  attribution: z.string().nullable().describe("Author or source name if identifiable"),
});

const summarySchema = z.object({
  content: z
    .string()
    .min(20)
    .max(800)
    .describe("1-2 sentence overview naming the specific topic with concrete details"),
  bulletPoints: z
    .array(z.string().min(1))
    .min(2)
    .max(5)
    .describe(
      "Specific takeaways, each containing at least one name, number, or technical term from the highlight",
    ),
});

const TYPE_SCHEMAS: Record<DraftCardType, z.ZodSchema> = {
  insight: insightSchema,
  quiz: quizSchema,
  quote: quoteSchema,
  summary: summarySchema,
};

const CLASSIFICATION_SYSTEM = `You classify highlighted passages into the best-fit learning card type.

<rules>
Apply these rules in order. Use the FIRST matching rule:

1. Is the highlight under ~200 characters AND a complete sentence/phrase that is memorable, emotional, or quotable?
   -> "quote"

2. Does the highlight contain a specific verifiable fact: a number, date, percentage, name, or concrete claim?
   -> "quiz"

3. Does the highlight contain 3+ distinct points, ideas, or facts?
   -> "summary"

4. None of the above apply.
   -> "insight"
</rules>

<important>
- Do NOT default to "insight" for every highlight
- Most short highlights (< 200 chars) should be "quote"
- Highlights with specific numbers/dates should be "quiz"
- "insight" is the fallback when no other type fits
</important>`;

function buildClassificationPrompt(opts: {
  highlights: Array<{ highlightId: string; highlightText: string }>;
  documentTitle: string;
  sectionTitle: string;
}): string {
  const highlightList = opts.highlights
    .map((h) => `- [${h.highlightId}] (${h.highlightText.length} chars): "${h.highlightText}"`)
    .join("\n");

  return `Document: "${opts.documentTitle}", Section: "${opts.sectionTitle}"

Highlights to classify:
${highlightList}

Classify each highlight into exactly one card type.`;
}

function buildGenerationSystem(opts: { cardType: DraftCardType; language?: string }): string {
  const { cardType, language } = opts;
  const base = `You are an AI learning assistant for Scrollect. ${buildLanguageInstruction(language)}`;

  switch (cardType) {
    case "quote":
      return `${base}

Create a QUOTE card from a highlighted passage.

<rules>
- quotedText: copy the highlight text EXACTLY, character-for-character. Do not modify or paraphrase.
- content: explain WHO said/wrote this, in what CONTEXT, and WHY it matters. Reference at least one specific detail from the source chunks (a name, event, date, or number).
- attribution: the author or speaker if identifiable from the source chunks, or null.
- Do NOT reference the document title as a source - only cite details that appear in the source chunks.
</rules>

<avoid>
- Generic content like "this quote illustrates an important aspect..."
- Referencing book/article titles as if they were source details
</avoid>`;

    case "quiz":
      return `${base}

Create a QUIZ card testing recall of a specific fact from a highlighted passage.

<rules>
- question: target a concrete, verifiable fact (a name, number, date, or specific claim) that appears in BOTH the highlight AND the source chunks
- If the highlight contains a fact not present in the source chunks, use a related fact from the chunks instead
- options: exactly 4 plausible choices for multiple_choice. All wrong options must be plausible but clearly incorrect.
- explanation: cite the exact detail from the source chunks that proves the correct answer
- content: provide context using specific names/events from the source chunks
</rules>

<avoid>
- Questions about facts that only appear in the highlight but not in the source chunks
- Vague questions that could have multiple valid answers
</avoid>`;

    case "insight":
      return `${base}

Create an INSIGHT card - a specific fact, surprising detail, or concrete example from a highlighted passage.

<rules>
- content: 2-4 sentences grounding the insight in the highlighted text
- Use **bold** for key terms (names, technical terms, numbers)
- Include at least one direct phrase from the highlight text
- The first sentence must contain a specific fact, not a general introduction
- Reference specific names, numbers, or facts from the source chunks
</rules>

<avoid>
- "This passage highlights an important aspect of..."
- Generic summaries that could apply to any document
</avoid>`;

    case "summary":
      return `${base}

Create a SUMMARY card extracting specific takeaways from a highlighted passage.

<rules>
- bulletPoints: 2-5 specific takeaways, each containing at least one name, number, or technical term from the highlight
- Each bullet must reference a distinct, concrete detail - not a rewording of another bullet
- content: 1-2 sentence overview naming the specific topic (not "this passage covers key ideas")
</rules>

<avoid>
- Abstract bullets like "the author discusses important concepts"
- Bullets that merely rephrase each other
</avoid>`;
  }
}

function buildGenerationPrompt(opts: {
  highlightText: string;
  sectionSummary: string;
  sectionTitle: string;
  chunks: Array<{ content: string; chunkId: string }>;
  documentTitle: string;
}): string {
  const chunkText = opts.chunks.map((c, i) => `Chunk ${i}:\n${c.content}`).join("\n\n---\n\n");

  return `Document: "${opts.documentTitle}"
Section: "${opts.sectionTitle}"
Section summary: ${opts.sectionSummary}

Source chunks:
${chunkText}

Highlighted passage to create a card from:
"${opts.highlightText}"`;
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

function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    totalTokens: a.totalTokens + b.totalTokens,
  };
}

export class AiSdkHighlightDraftLlm implements HighlightDraftLlm {
  async generateDraftsFromHighlights(opts: {
    highlights: Array<{ highlightId: string; highlightText: string }>;
    sectionSummary: string;
    sectionTitle: string;
    chunks: Array<{ content: string; chunkId: string }>;
    documentTitle: string;
    language?: string;
  }): Promise<{
    cards: Array<{
      highlightId: string;
      content: string;
      cardType: DraftCardType;
      typeData: Record<string, unknown>;
    }>;
    usage: TokenUsage;
  }> {
    let totalUsage: TokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

    const { output: classificationOutput, usage: classificationUsage } = await generateText({
      model: getAI().languageModel("classify"),
      output: Output.object({ schema: classificationSchema }),
      system: CLASSIFICATION_SYSTEM,
      prompt: buildClassificationPrompt({
        highlights: opts.highlights,
        documentTitle: opts.documentTitle,
        sectionTitle: opts.sectionTitle,
      }),
      maxRetries: 2,
    });

    totalUsage = addUsage(totalUsage, normalizeUsage(classificationUsage));

    const classifications = classificationOutput?.classifications ?? [];
    const classMap = new Map(
      classifications.map((c) => [c.highlightId, c.cardType as DraftCardType]),
    );

    const generationPromises = opts.highlights.map(async (highlight) => {
      const cardType = classMap.get(highlight.highlightId) ?? "insight";
      const schema = TYPE_SCHEMAS[cardType];

      const { output, usage } = await generateText({
        model: getAI().languageModel("generate"),
        output: Output.object({ schema }),
        system: buildGenerationSystem({ cardType, language: opts.language }),
        prompt: buildGenerationPrompt({
          highlightText: highlight.highlightText,
          sectionSummary: opts.sectionSummary,
          sectionTitle: opts.sectionTitle,
          chunks: opts.chunks,
          documentTitle: opts.documentTitle,
        }),
        maxRetries: 2,
      });

      const result = output ?? { content: "" };
      const content = (result as Record<string, unknown>).content as string;
      const typeData: Record<string, unknown> = { type: cardType };

      switch (cardType) {
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
        case "insight":
          break;
      }

      return {
        card: {
          highlightId: highlight.highlightId,
          content,
          cardType,
          typeData,
        },
        usage: normalizeUsage(usage),
      };
    });

    const results = await Promise.all(generationPromises);

    const cards = results.map((r) => r.card);
    for (const r of results) {
      totalUsage = addUsage(totalUsage, r.usage);
    }

    return { cards, usage: totalUsage };
  }
}
