import { evalite } from "evalite";

import { AiSdkConnectionDiscoveryLlm } from "../../providers/connectionDiscoveryLlm";
import {
  BOOK_EN_LEARNING,
  ARTICLE_EN_ARCHITECTURE,
  YOUTUBE_EN_ML,
  BOOK_PL_LEWANDOWSKI,
} from "./fixtures";
import type { FixtureDocument, FixtureSection } from "./fixtures";
import { contentSpecificity, languageMatch, connectionGenuineness } from "./scorers";

type ConnectionInput = {
  sectionATitle: string;
  sectionASummary: string;
  sectionAChunks: Array<{ content: string; chunkId: string }>;
  sectionBTitle: string;
  sectionBSummary: string;
  sectionBChunks: Array<{ content: string; chunkId: string }>;
  documentATitle: string;
  documentBTitle: string;
  expectedLanguage: "en" | "pl";
};

type ConnectionOutput = {
  content: string;
  typeData: Record<string, unknown>;
  sourceChunks: string[];
  isGenuineConnection: boolean;
  expectedLanguage: "en" | "pl";
  sectionATitle: string;
  sectionASummary: string;
  sectionBTitle: string;
  sectionBSummary: string;
};

const llm = new AiSdkConnectionDiscoveryLlm();

function makePair(opts: {
  docA: FixtureDocument;
  sectionA: FixtureSection;
  docB: FixtureDocument;
  sectionB: FixtureSection;
}): ConnectionInput {
  const language = opts.docA.language === opts.docB.language ? opts.docA.language : "en";
  return {
    sectionATitle: opts.sectionA.sectionTitle,
    sectionASummary: opts.sectionA.sectionSummary,
    sectionAChunks: opts.sectionA.chunks,
    sectionBTitle: opts.sectionB.sectionTitle,
    sectionBSummary: opts.sectionB.sectionSummary,
    sectionBChunks: opts.sectionB.chunks,
    documentATitle: opts.docA.title,
    documentBTitle: opts.docB.title,
    expectedLanguage: language,
  };
}

function buildConnectionData(): ConnectionInput[] {
  return [
    makePair({
      docA: BOOK_EN_LEARNING,
      sectionA: BOOK_EN_LEARNING.sections[0]!,
      docB: YOUTUBE_EN_ML,
      sectionB: YOUTUBE_EN_ML.sections[3]!,
    }),
    makePair({
      docA: BOOK_EN_LEARNING,
      sectionA: BOOK_EN_LEARNING.sections[1]!,
      docB: YOUTUBE_EN_ML,
      sectionB: YOUTUBE_EN_ML.sections[1]!,
    }),
    makePair({
      docA: ARTICLE_EN_ARCHITECTURE,
      sectionA: ARTICLE_EN_ARCHITECTURE.sections[1]!,
      docB: ARTICLE_EN_ARCHITECTURE,
      sectionB: ARTICLE_EN_ARCHITECTURE.sections[2]!,
    }),
    makePair({
      docA: BOOK_EN_LEARNING,
      sectionA: BOOK_EN_LEARNING.sections[2]!,
      docB: ARTICLE_EN_ARCHITECTURE,
      sectionB: ARTICLE_EN_ARCHITECTURE.sections[0]!,
    }),
    makePair({
      docA: BOOK_PL_LEWANDOWSKI,
      sectionA: BOOK_PL_LEWANDOWSKI.sections[2]!,
      docB: BOOK_PL_LEWANDOWSKI,
      sectionB: BOOK_PL_LEWANDOWSKI.sections[3]!,
    }),
  ];
}

evalite("Connection Discovery", {
  data: () => buildConnectionData().map((d) => ({ input: d })),
  task: async (input) => {
    const allChunks = [
      ...input.sectionAChunks.map((c) => c.content),
      ...input.sectionBChunks.map((c) => c.content),
    ];

    const emptyResult: ConnectionOutput = {
      content: "",
      typeData: {},
      sourceChunks: allChunks,
      isGenuineConnection: false,
      expectedLanguage: input.expectedLanguage,
      sectionATitle: input.sectionATitle,
      sectionASummary: input.sectionASummary,
      sectionBTitle: input.sectionBTitle,
      sectionBSummary: input.sectionBSummary,
    };

    try {
      const { card } = await llm.generateConnectionDraft({
        sectionA: {
          title: input.sectionATitle,
          summary: input.sectionASummary,
          chunks: input.sectionAChunks,
        },
        sectionB: {
          title: input.sectionBTitle,
          summary: input.sectionBSummary,
          chunks: input.sectionBChunks,
        },
        documentATitle: input.documentATitle,
        documentBTitle: input.documentBTitle,
      });

      if (!card) return emptyResult;

      return {
        content: card.content,
        typeData: card.typeData,
        sourceChunks: allChunks,
        isGenuineConnection: true,
        expectedLanguage: input.expectedLanguage,
        sectionATitle: input.sectionATitle,
        sectionASummary: input.sectionASummary,
        sectionBTitle: input.sectionBTitle,
        sectionBSummary: input.sectionBSummary,
      } satisfies ConnectionOutput;
    } catch {
      return emptyResult;
    }
  },
  scorers: [contentSpecificity, languageMatch, connectionGenuineness],
  trialCount: 3,
});
