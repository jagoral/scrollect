import { evalite } from "evalite";

import { AiSdkCardDraftLlm } from "../src/providers/llm/cardDraftLlm";
import type { DraftCardType } from "../convex/lib/validators";
import {
  ARTICLE_EN_ARCHITECTURE,
  BOOK_EN_LEARNING,
  BOOK_PL_LEWANDOWSKI,
  YOUTUBE_EN_ML,
} from "./fixtures";
import {
  structuralValidity,
  languageMatch,
  contentSpecificity,
  contentLength,
  typeSpecificQuality,
  referenceClarity,
  quoteContextCompleteness,
  substantiveContent,
  transcriptionPolish,
} from "./scorers";

type SectionInput = {
  cardType: DraftCardType;
  sectionTitle: string;
  sectionSummary: string;
  chunks: Array<{ content: string; chunkId: string }>;
  documentTitle: string;
  expectedLanguage: "en" | "pl";
  fileType?: string;
};

type CardDraftOutput = {
  cardType: DraftCardType;
  content: string;
  typeData: Record<string, unknown>;
  sourceChunks: string[];
  expectedLanguage: "en" | "pl";
  fileType?: string;
};

const llm = new AiSdkCardDraftLlm();

function buildSectionInputs(): SectionInput[] {
  return [
    {
      cardType: "insight",
      sectionTitle: ARTICLE_EN_ARCHITECTURE.sections[1]!.sectionTitle,
      sectionSummary: ARTICLE_EN_ARCHITECTURE.sections[1]!.sectionSummary,
      chunks: ARTICLE_EN_ARCHITECTURE.sections[1]!.chunks,
      documentTitle: ARTICLE_EN_ARCHITECTURE.title,
      expectedLanguage: ARTICLE_EN_ARCHITECTURE.language,
      fileType: ARTICLE_EN_ARCHITECTURE.fileType,
    },
    {
      cardType: "summary",
      sectionTitle: BOOK_EN_LEARNING.sections[1]!.sectionTitle,
      sectionSummary: BOOK_EN_LEARNING.sections[1]!.sectionSummary,
      chunks: BOOK_EN_LEARNING.sections[1]!.chunks,
      documentTitle: BOOK_EN_LEARNING.title,
      expectedLanguage: BOOK_EN_LEARNING.language,
      fileType: BOOK_EN_LEARNING.fileType,
    },
    {
      cardType: "quiz",
      sectionTitle: YOUTUBE_EN_ML.sections[1]!.sectionTitle,
      sectionSummary: YOUTUBE_EN_ML.sections[1]!.sectionSummary,
      chunks: YOUTUBE_EN_ML.sections[1]!.chunks,
      documentTitle: YOUTUBE_EN_ML.title,
      expectedLanguage: YOUTUBE_EN_ML.language,
      fileType: YOUTUBE_EN_ML.fileType,
    },
    {
      cardType: "quote",
      sectionTitle: BOOK_PL_LEWANDOWSKI.sections[3]!.sectionTitle,
      sectionSummary: BOOK_PL_LEWANDOWSKI.sections[3]!.sectionSummary,
      chunks: BOOK_PL_LEWANDOWSKI.sections[3]!.chunks,
      documentTitle: BOOK_PL_LEWANDOWSKI.title,
      expectedLanguage: BOOK_PL_LEWANDOWSKI.language,
      fileType: BOOK_PL_LEWANDOWSKI.fileType,
    },
  ];
}

evalite("Section Draft Smoke", {
  data: () => buildSectionInputs().map((s) => ({ input: s })),
  task: async (input: SectionInput) => {
    const { card } = await llm.generateDraft({
      cardType: input.cardType,
      sectionSummary: input.sectionSummary,
      sectionTitle: input.sectionTitle,
      chunks: input.chunks,
      documentTitle: input.documentTitle,
      fileType: input.fileType,
    });

    if (!card) {
      return {
        cardType: input.cardType,
        content: "",
        typeData: { type: input.cardType },
        sourceChunks: input.chunks.map((c) => c.content),
        expectedLanguage: input.expectedLanguage,
        fileType: input.fileType,
      } satisfies CardDraftOutput;
    }

    return {
      cardType: input.cardType,
      content: card.content,
      typeData: card.typeData,
      sourceChunks: input.chunks.map((c) => c.content),
      expectedLanguage: input.expectedLanguage,
      fileType: input.fileType,
    } satisfies CardDraftOutput;
  },
  scorers: [
    structuralValidity,
    languageMatch,
    contentSpecificity,
    contentLength,
    typeSpecificQuality,
    referenceClarity,
    quoteContextCompleteness,
    substantiveContent,
    transcriptionPolish,
  ],
  trialCount: 1,
});
