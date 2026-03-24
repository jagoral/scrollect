import { evalite } from "evalite";

import { AiSdkHighlightDraftLlm } from "../../providers/highlightDraftLlm";
import { ALL_FIXTURES } from "./fixtures";
import {
  structuralValidity,
  languageMatch,
  contentSpecificity,
  typeSpecificQuality,
} from "./scorers";
import type { DraftCardType } from "../../lib/validators";

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
  expectedLanguage: "en" | "pl";
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
    const emptyResult = {
      cardType: "insight" as DraftCardType,
      content: "",
      typeData: { type: "insight" },
      sourceChunks: input.chunks.map((c) => c.content),
      expectedLanguage: input.expectedLanguage,
    };

    try {
      const { cards } = await llm.generateDraftsFromHighlights({
        highlights: [{ highlightId: input.highlightId, highlightText: input.highlightText }],
        sectionSummary: input.sectionSummary,
        sectionTitle: input.sectionTitle,
        chunks: input.chunks,
        documentTitle: input.documentTitle,
      });

      const card = cards[0];
      if (!card) return emptyResult;

      return {
        cardType: card.cardType,
        content: card.content,
        typeData: card.typeData,
        sourceChunks: input.chunks.map((c) => c.content),
        expectedLanguage: input.expectedLanguage,
      } satisfies HighlightDraftOutput;
    } catch {
      return emptyResult;
    }
  },
  scorers: [structuralValidity, languageMatch, contentSpecificity, typeSpecificQuality],
  trialCount: 3,
});
