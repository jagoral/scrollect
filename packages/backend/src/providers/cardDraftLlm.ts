import { generateText, Output } from "ai";
import { z } from "zod";

import type { CardDraftLlm, DraftCardType } from "./types";
import { type TokenUsage, getAI, normalizeUsage } from "./ai";
import { isSpeechSource } from "./contentTypes";
import { buildLanguageInstruction } from "./promptUtils";

const insightSchema = z.object({
  content: z
    .string()
    .min(50)
    .max(1200)
    .describe(
      "3-6 sentences with specific facts, surprising details, and concrete examples. Use **bold** for key terms. Provide enough context so the card is self-contained and useful without reading the source.",
    ),
});

const quizSchema = z.object({
  content: z
    .string()
    .min(20)
    .max(1200)
    .describe("Description of what this quiz tests and why it matters"),
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
  content: z
    .string()
    .min(20)
    .max(1200)
    .describe("Context for the quote: who said it, about what, and why it matters (2-4 sentences)"),
  quotedText: z
    .string()
    .min(10)
    .describe("Exact verbatim quote copied from the source chunks - do not paraphrase"),
  attribution: z
    .string()
    .min(1)
    .describe(
      "Who said or wrote this quote - use their full proper name (e.g. 'Robert Lewandowski', not 'the player')",
    ),
});

const summarySchema = z.object({
  content: z
    .string()
    .min(20)
    .max(1200)
    .describe("Overview of the section with key context (2-4 sentences)"),
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

function buildSystemPrompt(opts: {
  cardType: DraftCardType;
  language?: string;
  fileType?: string;
}): string {
  const { cardType, language, fileType } = opts;
  const base = `You are an AI learning assistant for Scrollect, a personal learning feed app.
Your job is to create a single focused learning card from a section of a document.

<instructions>
1. ${buildLanguageInstruction(language)}
2. Before writing, identify 2-3 specific details from the source: exact names, numbers, dates, or notable phrases you will reference in the card.
3. Create the card using those specific details. Stay close to the source text.
</instructions>

<quality_rules>
- Prefer exact wordings, specific facts, and concrete examples over generic summaries
- The user wants to re-encounter the actual content they saved, not a paraphrased version
- Every sentence must reference something specific from the source chunks
- ALWAYS use proper names (e.g. "Marie Curie", "Google DeepMind") instead of vague references (e.g. "the scientist", "the company", "the author", "the coach"). If a person's or organization's name appears in the source, use it
- When referring to people, places, teams, or organizations, use their specific names from the source text. Never substitute a proper name with a generic title or pronoun when the name is available
</quality_rules>

<avoid>
- "This section discusses important concepts about..."
- "The author explores various aspects of..."
- "There are several key factors that..."
- Any sentence that could apply to a different document without changes
- Vague references like "the player", "the coach", "the author", "the expert" when their proper name is in the source
- "A prominent figure" or "one individual" instead of their actual name
</avoid>`;

  switch (cardType) {
    case "insight":
      return `${base}

<task>Create an INSIGHT card - a specific fact, surprising detail, or concrete example from the source.</task>

<format>
- 3-6 sentences (aim for 400-800 characters). The card should be self-contained and useful on its own
- Use **bold** for key terms (names, technical terms, numbers)
- Include at least one direct phrase from the source text
- The first sentence must contain a specific fact, not a general introduction
- Add enough context so the reader understands the significance without opening the source
</format>`;

    case "quiz":
      return `${base}

<task>Create a QUIZ card testing recall of a specific detail from the source.</task>

<format>
- The content field should provide 3-5 sentences of context about what the quiz tests and why it matters (aim for 400-800 characters)
- The question must target a concrete, verifiable fact (a name, number, date, or specific claim)
- For multiple_choice: provide exactly 4 options where all wrong options are plausible but clearly incorrect based on the source
- For true_false: the statement must be specific enough that the answer is unambiguous
- The explanation must quote or closely reference the exact source passage that contains the answer
</format>`;

    case "quote":
      return `${base}

<task>Create a QUOTE card featuring a notable passage from the source.</task>

${
  isSpeechSource(fileType)
    ? `<format>
- Search the source chunks for the most impactful, memorable, or thought-provoking passage
- The source is a speech transcription that may contain fillers (e.g. "um", "uh", "like", "you know"), stutters, false starts, and word repetitions
- Lightly clean the passage: remove fillers, stutters, false starts, and word repetitions while preserving the speaker's original meaning, voice, and phrasing
- Do NOT paraphrase or rewrite - only remove speech artifacts. The cleaned quote should read as if the speaker had spoken fluently
- The attribution field is REQUIRED: always include the speaker's full proper name (e.g. "Ada Lovelace", not "a mathematician" or "the speaker")
- In the content field, provide 3-5 sentences of context (aim for 400-800 characters) that include: WHO said it (proper name), ABOUT WHOM or WHAT it was said, WHEN/WHERE if available, and WHY it matters
- The content must make the quote fully understandable without needing to read the original source
</format>`
    : `<format>
- Search the source chunks for the most impactful, memorable, or thought-provoking passage
- Copy the passage exactly as it appears in the source, character by character - do not paraphrase, rephrase, or clean up the text
- The quotedText must be a verbatim substring of one of the source chunks
- The attribution field is REQUIRED: always include the speaker's or writer's full proper name (e.g. "Ada Lovelace", not "a mathematician" or "the author")
- In the content field, provide 3-5 sentences of context (aim for 400-800 characters) that include: WHO said it (proper name), ABOUT WHOM or WHAT it was said, WHEN/WHERE if available, and WHY it matters
- The content must make the quote fully understandable without needing to read the original source
</format>`
}`;

    case "summary":
      return `${base}

<task>Create a SUMMARY card with bullet points listing specific takeaways from the section.</task>

<format>
- 2-5 bullet points, each containing at least one proper noun, number, or technical term from the source
- Each bullet must reference a distinct, concrete detail - not a rewording of another bullet
- In the content field, provide a 3-5 sentence overview (aim for 400-800 characters) that names the specific topic, key players, and why it matters (not "this section covers key ideas")
</format>`;
  }
}

export class AiSdkCardDraftLlm implements CardDraftLlm {
  async generateDraft(opts: {
    cardType: DraftCardType;
    sectionSummary: string;
    sectionTitle: string;
    chunks: Array<{ content: string; chunkId: string }>;
    documentTitle: string;
    language?: string;
    fileType?: string;
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
      system: buildSystemPrompt({
        cardType: opts.cardType,
        language: opts.language,
        fileType: opts.fileType,
      }),
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
        typeData.attribution = q.attribution;
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
      usage: normalizeUsage(usage, "generate"),
    };
  }
}
