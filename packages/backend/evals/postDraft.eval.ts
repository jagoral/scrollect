import { evalite } from "evalite";

import { AiSdkPostDraftLlm } from "../src/providers/llm/postDraftLlm";
import type { DraftPostType } from "../convex/lib/validators";
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
  postType: DraftPostType;
  sectionTitle: string;
  sectionSummary: string;
  chunks: Array<{ content: string; chunkId: string }>;
  documentTitle: string;
  expectedLanguage: "en" | "pl";
  fileType?: string;
};

type PostDraftOutput = {
  postType: DraftPostType;
  content: string;
  typeData: Record<string, unknown>;
  sourceChunks: string[];
  expectedLanguage: "en" | "pl";
  fileType?: string;
};

const llm = new AiSdkPostDraftLlm();

function buildSectionInputs(): SectionInput[] {
  return [
    {
      postType: "insight",
      sectionTitle: ARTICLE_EN_ARCHITECTURE.sections[1]!.sectionTitle,
      sectionSummary: ARTICLE_EN_ARCHITECTURE.sections[1]!.sectionSummary,
      chunks: ARTICLE_EN_ARCHITECTURE.sections[1]!.chunks,
      documentTitle: ARTICLE_EN_ARCHITECTURE.title,
      expectedLanguage: ARTICLE_EN_ARCHITECTURE.language,
      fileType: ARTICLE_EN_ARCHITECTURE.fileType,
    },
    {
      postType: "summary",
      sectionTitle: BOOK_EN_LEARNING.sections[1]!.sectionTitle,
      sectionSummary: BOOK_EN_LEARNING.sections[1]!.sectionSummary,
      chunks: BOOK_EN_LEARNING.sections[1]!.chunks,
      documentTitle: BOOK_EN_LEARNING.title,
      expectedLanguage: BOOK_EN_LEARNING.language,
      fileType: BOOK_EN_LEARNING.fileType,
    },
    {
      postType: "quiz",
      sectionTitle: YOUTUBE_EN_ML.sections[1]!.sectionTitle,
      sectionSummary: YOUTUBE_EN_ML.sections[1]!.sectionSummary,
      chunks: YOUTUBE_EN_ML.sections[1]!.chunks,
      documentTitle: YOUTUBE_EN_ML.title,
      expectedLanguage: YOUTUBE_EN_ML.language,
      fileType: YOUTUBE_EN_ML.fileType,
    },
    {
      postType: "quote",
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
      postType: input.postType,
      sectionSummary: input.sectionSummary,
      sectionTitle: input.sectionTitle,
      chunks: input.chunks,
      documentTitle: input.documentTitle,
      fileType: input.fileType,
    });

    if (!card) {
      return {
        postType: input.postType,
        content: "",
        typeData: { type: input.postType },
        sourceChunks: input.chunks.map((c) => c.content),
        expectedLanguage: input.expectedLanguage,
        fileType: input.fileType,
      } satisfies PostDraftOutput;
    }

    return {
      postType: input.postType,
      content: card.content,
      typeData: card.typeData,
      sourceChunks: input.chunks.map((c) => c.content),
      expectedLanguage: input.expectedLanguage,
      fileType: input.fileType,
    } satisfies PostDraftOutput;
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
