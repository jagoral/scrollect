import { z } from "zod";

import type { PostDraftValidator, DraftPostType, ValidationResult } from "../types";
import { ZERO_USAGE, generate } from "./models";

const validationSchema = z.object({
  isValid: z
    .boolean()
    .describe("true if the post has genuine substantive content, false if worthless"),
  reason: z
    .string()
    .optional()
    .describe("Brief reason for rejection, only required when isValid is false"),
  semanticQualityScore: z
    .number()
    .min(0)
    .max(1)
    .describe(
      "Learning value on a 0-1 scale. 1.0 teaches a concrete concept, mechanism, tradeoff, example, failure mode, or decision rule. 0.0 is front matter, platitudes, or generic filler. See rubric in the system prompt.",
    ),
});

const SEMANTIC_RUBRIC = `You must ALSO return a semanticQualityScore in [0, 1] that measures the post's LEARNING VALUE, independent of structural validity.

SCORING RUBRIC (language-agnostic - apply to posts in any language):
- 0.85-1.00: Teaches a concrete concept, mechanism, tradeoff, failure mode, decision rule, or specific example. Self-contained. Memorable. Aligned with the source document.
- 0.60-0.85: Substantive but either generic, partially developed, or a simple recall fact. Useful but not a standout post.
- 0.30-0.60: Weak learning value. Vague, repeats obvious points, restates a section heading, or is a simple true/false with low insight.
- 0.00-0.30: Front matter, dedication, acknowledgements, legal text, part-divider, chapter-setup boilerplate, generic platitudes, or trivial/filler content.

IMPORTANT QUOTE ANCHOR: A quote post that is verbatim and well-formed but does NOT teach a concept, decision principle, mechanism, or memorable insight scores AT MOST 0.6. Do not let structural validity inflate learning value. Quote posts should only exceed 0.6 when the quoted passage itself conveys a substantive teachable idea.

IMPORTANT FRONT MATTER ANCHOR: Posts sourced from prefaces, dedications, part dividers, about-the-author pages, generic introductions that only announce what a chapter will cover, or other non-content artifacts score below 0.3. This applies regardless of the language of the source.

Return semanticQualityScore as your independent judgement. Do not pin it to isValid - a structurally valid but vague post should still score below 0.6.`;

function buildValidationPrompt(postType: DraftPostType): string {
  const base = `You are a content quality gate for a personal learning feed app.
Your job is to determine whether a generated learning post has genuine substance or is worthless filler.

Respond with isValid: true only if the post passes ALL criteria for its type.
Respond with isValid: false and a brief reason if the post fails any criterion.

${SEMANTIC_RUBRIC}`;

  switch (postType) {
    case "quote":
      return `${base}

QUOTE post criteria - the quotedText must be an actual spoken or written passage from a person:
- REJECT if quotedText is a video/article title, chapter heading, or section name
- REJECT if quotedText is table-of-contents content, metadata, or timestamps
- REJECT if quotedText is a sponsor read, advertisement, or call-to-action (e.g. "subscribe", "sign up", "brought to you by")
- REJECT if quotedText is a generic greeting or sign-off ("welcome to this video", "thanks for watching")
- ACCEPT only if quotedText is a substantive passage that conveys an idea, argument, or observation`;

    case "insight":
      return `${base}

INSIGHT post criteria - the content must contain a specific, verifiable fact or observation:
- REJECT if the content is a generic platitude that could apply to any topic
- REJECT if the content uses vague filler like "this section discusses...", "there are many factors...", "the author explores..."
- REJECT if the content merely describes what a section is about rather than stating a concrete fact
- REJECT if the content is derived from sponsor segments, ads, or calls-to-action
- ACCEPT only if the content states at least one specific claim with names, numbers, dates, or concrete details`;

    case "summary":
      return `${base}

SUMMARY post criteria - the bullet points must present distinct, concrete takeaways:
- REJECT if bullet points merely restate the section title in different words
- REJECT if bullet points are abstract filler without specific names, numbers, or concepts (e.g. "key concepts are discussed", "important ideas are covered")
- REJECT if all bullet points say essentially the same thing in different words
- REJECT if derived from table-of-contents, metadata, or sponsor content
- ACCEPT only if each bullet point references a distinct, concrete detail from the source`;

    case "quiz":
      return `${base}

QUIZ post criteria - the question must test recall of a specific fact from the source:
- REJECT if the question is trivially obvious (e.g. "Is machine learning useful?", "Is exercise good for health?")
- REJECT if the question is impossibly vague or unanswerable from the source
- REJECT if the question tests opinion rather than fact
- REJECT if derived from sponsor segments or calls-to-action
- ACCEPT only if the question targets a concrete, verifiable detail that requires having read the source`;
  }
}

export class AiSdkPostDraftValidator implements PostDraftValidator {
  async validateDraft(opts: {
    postType: DraftPostType;
    content: string;
    typeData: Record<string, unknown>;
    sectionTitle: string;
    documentTitle: string;
  }): Promise<ValidationResult> {
    const typeDataStr = JSON.stringify(opts.typeData, null, 2);

    const { output, usage } = await generate({
      model: "classify",
      schema: validationSchema,
      system: buildValidationPrompt(opts.postType),
      prompt: `Document: "${opts.documentTitle}"
Section: "${opts.sectionTitle}"
Card type: ${opts.postType}

Card content: "${opts.content}"
Type data: ${typeDataStr}`,
      temperature: 0,
    });

    if (!output) {
      return {
        isValid: true,
        rejectionReason: "Validator returned no output - failing open",
        usage,
      };
    }

    return {
      isValid: output.isValid,
      rejectionReason: output.reason,
      semanticQualityScore: clamp01(output.semanticQualityScore),
      usage,
    };
  }
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

export class StubPostDraftValidator implements PostDraftValidator {
  async validateDraft(opts: {
    postType: DraftPostType;
    content: string;
    typeData: Record<string, unknown>;
    sectionTitle: string;
    documentTitle: string;
  }): Promise<ValidationResult> {
    const score = syntheticSemanticQualityScore(opts);
    return { isValid: true, semanticQualityScore: score, usage: ZERO_USAGE };
  }
}

function syntheticSemanticQualityScore(opts: { postType: DraftPostType; content: string }): number {
  // ADR-018 §1: distribution must deliver std >= 0.15 and >= 20% of drafts below 0.7
  // across a realistic 4-type generation mix. Quote anchor stays hard: verbatim-but-
  // uneducational tops out below 0.6.
  const lengthFactor = Math.min(1, opts.content.length / 400);
  switch (opts.postType) {
    case "quote":
      return 0.15 + 0.4 * lengthFactor;
    case "summary":
      return 0.45 + 0.4 * lengthFactor;
    case "quiz":
      return 0.4 + 0.45 * lengthFactor;
    case "insight":
      return 0.7 + 0.25 * lengthFactor;
  }
}
