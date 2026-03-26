import { evalite } from "evalite";

import { AiSdkCardDraftLlm } from "../src/providers/cardDraftLlm";
import type { DraftCardType } from "../convex/lib/validators";
import { ALL_FIXTURES } from "./fixtures";
import {
  structuralValidity,
  languageMatch,
  contentSpecificity,
  typeSpecificQuality,
  referenceClarity,
  quoteContextCompleteness,
} from "./scorers";

type SectionInput = {
  sectionTitle: string;
  sectionSummary: string;
  chunks: Array<{ content: string; chunkId: string }>;
  documentTitle: string;
  expectedLanguage: "en" | "pl";
};

type CardDraftOutput = {
  cardType: DraftCardType;
  content: string;
  typeData: Record<string, unknown>;
  sourceChunks: string[];
  expectedLanguage: "en" | "pl";
};

const llm = new AiSdkCardDraftLlm();

function buildSectionInputs(): SectionInput[] {
  return ALL_FIXTURES.flatMap((doc) =>
    doc.sections.map((section) => ({
      sectionTitle: section.sectionTitle,
      sectionSummary: section.sectionSummary,
      chunks: section.chunks,
      documentTitle: doc.title,
      expectedLanguage: doc.language,
    })),
  );
}

evalite.each([
  { name: "insight", input: "insight" as DraftCardType },
  { name: "quiz", input: "quiz" as DraftCardType },
  { name: "quote", input: "quote" as DraftCardType },
  { name: "summary", input: "summary" as DraftCardType },
])("Section Draft: $name", {
  data: () => buildSectionInputs().map((s) => ({ input: s })),
  task: async (input: SectionInput, cardType: DraftCardType) => {
    const { card } = await llm.generateDraft({
      cardType,
      sectionSummary: input.sectionSummary,
      sectionTitle: input.sectionTitle,
      chunks: input.chunks,
      documentTitle: input.documentTitle,
    });

    return {
      cardType,
      content: card.content,
      typeData: card.typeData,
      sourceChunks: input.chunks.map((c) => c.content),
      expectedLanguage: input.expectedLanguage,
    } satisfies CardDraftOutput;
  },
  scorers: [
    structuralValidity,
    languageMatch,
    contentSpecificity,
    typeSpecificQuality,
    referenceClarity,
    quoteContextCompleteness,
  ],
  trialCount: 3,
});
