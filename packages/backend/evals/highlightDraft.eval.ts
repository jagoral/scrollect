import { evalite } from "evalite";

import { AiSdkHighlightDraftLlm } from "../src/providers/highlightDraftLlm";
import { ALL_FIXTURES } from "./fixtures";
import {
  structuralValidity,
  languageMatch,
  contentSpecificity,
  typeSpecificQuality,
} from "./scorers";
import type { DraftCardType } from "../convex/lib/validators";

type HighlightDraftInput = {
  highlightId: string;
  highlightText: string;
  sectionTitle: string;
  sectionSummary: string;
  chunks: Array<{ content: string; chunkId: string }>;
  documentTitle: string;
  expectedLanguage: "en" | "pl";
};

type HighlightDraftOutput = {
  cardType: DraftCardType;
  content: string;
  typeData: Record<string, unknown>;
  sourceChunks: string[];
  highlightText: string;
  expectedLanguage: "en" | "pl";
  usage: { inputTokens: number; outputTokens: number; totalTokens: number };
  durationMs: number;
};

const llm = new AiSdkHighlightDraftLlm();

function collectHighlightInputs(): HighlightDraftInput[] {
  const inputs: HighlightDraftInput[] = [];

  for (const doc of ALL_FIXTURES) {
    for (const section of doc.sections) {
      if (!section.highlights?.length) continue;
      for (const highlight of section.highlights) {
        inputs.push({
          highlightId: highlight.highlightId,
          highlightText: highlight.highlightText,
          sectionTitle: section.sectionTitle,
          sectionSummary: section.sectionSummary,
          chunks: section.chunks,
          documentTitle: doc.title,
          expectedLanguage: doc.language,
        });
      }
    }
  }

  return inputs;
}

evalite("Highlight Draft", {
  data: () => collectHighlightInputs().map((d) => ({ input: d })),
  task: async (input) => {
    const zeroUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
    const emptyResult = {
      cardType: "insight" as DraftCardType,
      content: "",
      typeData: { type: "insight" },
      sourceChunks: input.chunks.map((c) => c.content),
      highlightText: input.highlightText,
      expectedLanguage: input.expectedLanguage,
      usage: zeroUsage,
      durationMs: 0,
    };

    try {
      const start = performance.now();
      const { cards, usage } = await llm.generateDraftsFromHighlights({
        highlights: [{ highlightId: input.highlightId, highlightText: input.highlightText }],
        sectionSummary: input.sectionSummary,
        sectionTitle: input.sectionTitle,
        chunks: input.chunks,
        documentTitle: input.documentTitle,
      });
      const durationMs = Math.round(performance.now() - start);

      const card = cards[0];
      if (!card) return emptyResult;

      return {
        cardType: card.cardType,
        content: card.content,
        typeData: card.typeData,
        sourceChunks: input.chunks.map((c) => c.content),
        highlightText: input.highlightText,
        expectedLanguage: input.expectedLanguage,
        usage,
        durationMs,
      } satisfies HighlightDraftOutput;
    } catch {
      return emptyResult;
    }
  },
  scorers: [structuralValidity, languageMatch, contentSpecificity, typeSpecificQuality],
  trialCount: 3,
});
