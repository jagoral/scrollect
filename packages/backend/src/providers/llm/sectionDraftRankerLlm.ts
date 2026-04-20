import { z } from "zod";

import type { SectionDraftRankerLlm } from "../types";
import { type TokenUsage, ZERO_USAGE, generate } from "./models";
import { buildLanguageInstruction, buildLearningGoalContext } from "./promptUtils";

const rankingSchema = z.object({
  rankings: z
    .array(
      z.object({
        sectionSummaryId: z.string().min(1),
        qualitySignal: z
          .number()
          .min(0)
          .max(1)
          .describe("0 means no useful learning posts; 1 means very dense learning value"),
        quoteCandidate: z
          .boolean()
          .describe("True only if the section summary suggests a memorable verbatim quote exists"),
      }),
    )
    .describe("One ranking object for every input section"),
});

export class AiSdkSectionDraftRankerLlm implements SectionDraftRankerLlm {
  async rankSections(opts: {
    documentTitle: string;
    language?: string;
    learningGoal?: string;
    sections: Array<{
      sectionSummaryId: string;
      sectionTitle: string;
      summary: string;
      chunkCount: number;
      existingDraftCount?: number;
    }>;
  }): Promise<{
    rankings: Array<{
      sectionSummaryId: string;
      qualitySignal: number;
      quoteCandidate: boolean;
    }>;
    usage: TokenUsage;
  }> {
    const sectionList = opts.sections
      .map(
        (section, index) => `<section index="${index}" id="${section.sectionSummaryId}">
Title: ${section.sectionTitle}
Chunk count: ${section.chunkCount}
Existing drafts: ${section.existingDraftCount ?? 0}
Summary: ${section.summary}
</section>`,
      )
      .join("\n\n");

    const { output, usage } = await generate({
      model: "classify",
      schema: rankingSchema,
      temperature: 0.1,
      system: `You rank document sections for a personal learning feed.

<instructions>
1. ${buildLanguageInstruction(opts.language)}
2. Score each section by likely learning value, not by the language it is written in.
3. Prefer sections with concrete claims, mechanisms, tradeoffs, examples, names, numbers, or surprising details.
4. Penalize front matter, copyright, tables of contents, acknowledgements, dedications, and thin connective sections.
5. quoteCandidate should be true only when the section is likely to contain a memorable verbatim passage. Do not mark every good section as quote-worthy.
</instructions>`,
      prompt: `Document: "${opts.documentTitle}"
${buildLearningGoalContext(opts.learningGoal)}

Return one ranking for every section below. Preserve sectionSummaryId exactly.

${sectionList}`,
    });

    return { rankings: output?.rankings ?? [], usage };
  }
}

export class StubSectionDraftRankerLlm implements SectionDraftRankerLlm {
  async rankSections(opts: {
    documentTitle: string;
    language?: string;
    learningGoal?: string;
    sections: Array<{
      sectionSummaryId: string;
      sectionTitle: string;
      summary: string;
      chunkCount: number;
      existingDraftCount?: number;
    }>;
  }): Promise<{
    rankings: Array<{
      sectionSummaryId: string;
      qualitySignal: number;
      quoteCandidate: boolean;
    }>;
    usage: TokenUsage;
  }> {
    return {
      rankings: opts.sections.map((section, index) => ({
        sectionSummaryId: section.sectionSummaryId,
        qualitySignal: section.summary.length < 40 ? 0.25 : Math.max(0.45, 0.9 - index * 0.01),
        quoteCandidate: section.summary.includes('"') || section.summary.includes("\u201e"),
      })),
      usage: ZERO_USAGE,
    };
  }
}
