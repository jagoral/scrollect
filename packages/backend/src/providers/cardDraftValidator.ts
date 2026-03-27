import { generateText, Output } from "ai";
import { z } from "zod";

import type { CardDraftValidator, DraftCardType, ValidationResult } from "./types";
import { getAI, normalizeUsage } from "./ai";

const validationSchema = z.object({
  isValid: z
    .boolean()
    .describe("true if the card has genuine substantive content, false if worthless"),
  reason: z
    .string()
    .optional()
    .describe("Brief reason for rejection, only required when isValid is false"),
});

function buildValidationPrompt(cardType: DraftCardType): string {
  const base = `You are a content quality gate for a personal learning feed app.
Your job is to determine whether a generated learning card has genuine substance or is worthless filler.

Respond with isValid: true only if the card passes ALL criteria for its type.
Respond with isValid: false and a brief reason if the card fails any criterion.`;

  switch (cardType) {
    case "quote":
      return `${base}

QUOTE card criteria - the quotedText must be an actual spoken or written passage from a person:
- REJECT if quotedText is a video/article title, chapter heading, or section name
- REJECT if quotedText is table-of-contents content, metadata, or timestamps
- REJECT if quotedText is a sponsor read, advertisement, or call-to-action (e.g. "subscribe", "sign up", "brought to you by")
- REJECT if quotedText is a generic greeting or sign-off ("welcome to this video", "thanks for watching")
- ACCEPT only if quotedText is a substantive passage that conveys an idea, argument, or observation`;

    case "insight":
      return `${base}

INSIGHT card criteria - the content must contain a specific, verifiable fact or observation:
- REJECT if the content is a generic platitude that could apply to any topic
- REJECT if the content uses vague filler like "this section discusses...", "there are many factors...", "the author explores..."
- REJECT if the content merely describes what a section is about rather than stating a concrete fact
- REJECT if the content is derived from sponsor segments, ads, or calls-to-action
- ACCEPT only if the content states at least one specific claim with names, numbers, dates, or concrete details`;

    case "summary":
      return `${base}

SUMMARY card criteria - the bullet points must present distinct, concrete takeaways:
- REJECT if bullet points merely restate the section title in different words
- REJECT if bullet points are abstract filler without specific names, numbers, or concepts (e.g. "key concepts are discussed", "important ideas are covered")
- REJECT if all bullet points say essentially the same thing in different words
- REJECT if derived from table-of-contents, metadata, or sponsor content
- ACCEPT only if each bullet point references a distinct, concrete detail from the source`;

    case "quiz":
      return `${base}

QUIZ card criteria - the question must test recall of a specific fact from the source:
- REJECT if the question is trivially obvious (e.g. "Is machine learning useful?", "Is exercise good for health?")
- REJECT if the question is impossibly vague or unanswerable from the source
- REJECT if the question tests opinion rather than fact
- REJECT if derived from sponsor segments or calls-to-action
- ACCEPT only if the question targets a concrete, verifiable detail that requires having read the source`;
  }
}

export class AiSdkCardDraftValidator implements CardDraftValidator {
  async validateDraft(opts: {
    cardType: DraftCardType;
    content: string;
    typeData: Record<string, unknown>;
    sectionTitle: string;
    documentTitle: string;
  }): Promise<ValidationResult> {
    const typeDataStr = JSON.stringify(opts.typeData, null, 2);

    const { output, usage } = await generateText({
      model: getAI().languageModel("classify"),
      output: Output.object({ schema: validationSchema }),
      system: buildValidationPrompt(opts.cardType),
      prompt: `Document: "${opts.documentTitle}"
Section: "${opts.sectionTitle}"
Card type: ${opts.cardType}

Card content: "${opts.content}"
Type data: ${typeDataStr}`,
      temperature: 0,
      maxRetries: 2,
    });

    const usageWithModel = normalizeUsage(usage, "classify");

    if (!output) {
      return {
        isValid: true,
        rejectionReason: "Validator returned no output - failing open",
        usage: usageWithModel,
      };
    }

    return {
      isValid: output.isValid,
      rejectionReason: output.reason,
      usage: usageWithModel,
    };
  }
}
