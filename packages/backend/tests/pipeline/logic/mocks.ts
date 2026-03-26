import {
  createMockEmbedder,
  createMockSummaryStore,
  createMockVectorStore,
} from "../../feed/logic/mocks";
import type {
  CardDraftLlm,
  ConnectionDiscoveryLlm,
  ConnectionDiscoveryServiceContext,
  ContentExtractor,
  DocumentParser,
  DraftCardType,
  DraftGenerationServiceContext,
  EmbeddingServiceContext,
  ExtractResult,
  ExtractionServiceContext,
  HighlightDraftGenerationServiceContext,
  HighlightDraftLlm,
  ParsingServiceContext,
  PollResult,
  SummarizingLlm,
  SummarizingServiceContext,
  TaggingLlm,
  TaggingServiceContext,
  ThematicDraftGenerationServiceContext,
  ThematicLlm,
  TokenUsage,
} from "../../../src/providers/types";

const ZERO_USAGE: TokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

export function createMockSummarizingLlm(overrides?: Partial<SummarizingLlm>): SummarizingLlm {
  return {
    generateSectionSummary: async ({ sectionTitle }) => ({
      summary: `Summary of ${sectionTitle}`,
      usage: ZERO_USAGE,
    }),
    generateDocumentSummary: async () => ({
      summary: "Document-level summary",
      usage: ZERO_USAGE,
    }),
    ...overrides,
  };
}

export function createMockTaggingLlm(overrides?: Partial<TaggingLlm>): TaggingLlm {
  return {
    suggestTags: async () => ({
      tags: ["tag1", "tag2", "tag3"],
      usage: ZERO_USAGE,
    }),
    ...overrides,
  };
}

export function createMockParser(overrides?: Partial<DocumentParser>): DocumentParser {
  return {
    submit: async () => "https://check.example.com/job/123",
    poll: async (): Promise<PollResult> => ({
      status: "complete",
      markdown: "# Parsed content",
    }),
    ...overrides,
  };
}

export function createMockArticleExtractor(
  overrides?: Partial<ContentExtractor>,
): ContentExtractor {
  return {
    extract: async (): Promise<ExtractResult> => ({
      markdown: "# Article content",
      title: "Extracted Article Title",
    }),
    ...overrides,
  };
}

export function createMockYouTubeExtractor(
  overrides?: Partial<ContentExtractor>,
): ContentExtractor {
  return {
    extract: async (): Promise<ExtractResult> => ({
      markdown: "# YouTube transcript",
      title: "Extracted Video Title",
      metadata: { provider: "decodo" },
    }),
    ...overrides,
  };
}

export function createMockSummarizingServices(
  overrides?: Partial<SummarizingServiceContext>,
): SummarizingServiceContext {
  return {
    llm: createMockSummarizingLlm(),
    embedder: createMockEmbedder(),
    summaryStore: createMockSummaryStore(),
    ...overrides,
  };
}

export function createMockEmbeddingServices(
  overrides?: Partial<EmbeddingServiceContext>,
): EmbeddingServiceContext {
  return {
    embedder: createMockEmbedder(),
    vectorStore: createMockVectorStore(),
    ...overrides,
  };
}

export function createMockParsingServices(
  overrides?: Partial<ParsingServiceContext>,
): ParsingServiceContext {
  return {
    parser: createMockParser(),
    ...overrides,
  };
}

export function createMockExtractionServices(
  overrides?: Partial<ExtractionServiceContext>,
): ExtractionServiceContext {
  return {
    articleExtractor: createMockArticleExtractor(),
    youtubeExtractor: createMockYouTubeExtractor(),
    ...overrides,
  };
}

export function createMockTaggingServices(
  overrides?: Partial<TaggingServiceContext>,
): TaggingServiceContext {
  return {
    llm: createMockTaggingLlm(),
    ...overrides,
  };
}

export function createMockCardDraftLlm(overrides?: Partial<CardDraftLlm>): CardDraftLlm {
  return {
    generateDraft: async (opts: {
      cardType: DraftCardType;
      sectionSummary: string;
      sectionTitle: string;
      chunks: Array<{ content: string; chunkId: string }>;
      documentTitle: string;
    }) => ({
      card: {
        content: `Draft ${opts.cardType} for "${opts.sectionTitle}": a useful learning card.`,
        typeData: buildMockTypeData(opts.cardType),
      },
      usage: ZERO_USAGE,
    }),
    ...overrides,
  };
}

function buildMockTypeData(cardType: DraftCardType): Record<string, unknown> {
  switch (cardType) {
    case "insight":
      return { type: "insight" };
    case "quiz":
      return {
        type: "quiz",
        variant: "multiple_choice",
        question: "What is the key concept?",
        options: ["Option A", "Option B", "Option C", "Option D"],
        correctIndex: 0,
        explanation: "Option A is correct because of the key concept.",
      };
    case "quote":
      return {
        type: "quote",
        quotedText: "This is a notable passage from the source material.",
      };
    case "summary":
      return {
        type: "summary",
        bulletPoints: ["First key takeaway", "Second key takeaway"],
      };
  }
}

export function createMockDraftGenerationServices(
  overrides?: Partial<DraftGenerationServiceContext>,
): DraftGenerationServiceContext {
  return {
    llm: createMockCardDraftLlm(),
    ...overrides,
  };
}

export function createMockThematicLlm(overrides?: Partial<ThematicLlm>): ThematicLlm {
  return {
    discoverThemes: async ({ sectionSummaries }) => ({
      themes: [
        {
          title: "Core Concepts",
          description: "The fundamental ideas that connect multiple sections.",
          relevantSections: sectionSummaries.slice(0, 2).map((s) => s.sectionTitle),
        },
      ],
      usage: ZERO_USAGE,
    }),
    ...overrides,
  };
}

export function createMockThematicDraftGenerationServices(
  overrides?: Partial<ThematicDraftGenerationServiceContext>,
): ThematicDraftGenerationServiceContext {
  return {
    thematicLlm: createMockThematicLlm(),
    draftLlm: createMockCardDraftLlm(),
    embedder: createMockEmbedder(),
    vectorStore: createMockVectorStore(),
    ...overrides,
  };
}

export function createMockConnectionDiscoveryLlm(
  overrides?: Partial<ConnectionDiscoveryLlm>,
): ConnectionDiscoveryLlm {
  return {
    generateConnectionDraft: async (opts) => ({
      card: {
        content: `Connection between "${opts.sectionA.title}" and "${opts.sectionB.title}": meaningful conceptual link.`,
        typeData: {
          type: "connection",
          sourceATitleHint: opts.documentATitle,
          sourceBTitleHint: opts.documentBTitle,
          sourceAKeyIdea: `Key idea from ${opts.sectionA.title}`,
          sourceBKeyIdea: `Key idea from ${opts.sectionB.title}`,
        },
      },
      usage: ZERO_USAGE,
    }),
    ...overrides,
  };
}

export function createMockConnectionDiscoveryServices(
  overrides?: Partial<ConnectionDiscoveryServiceContext>,
): ConnectionDiscoveryServiceContext {
  return {
    llm: createMockConnectionDiscoveryLlm(),
    summaryStore: createMockSummaryStore(),
    embedder: createMockEmbedder(),
    ...overrides,
  };
}

export function createMockHighlightDraftLlm(
  overrides?: Partial<HighlightDraftLlm>,
): HighlightDraftLlm {
  return {
    generateDraftsFromHighlights: async (opts) => ({
      cards: opts.highlights.map((h) => ({
        highlightId: h.highlightId,
        content: `Insight from highlight in "${opts.sectionTitle}": ${h.highlightText.slice(0, 50)}`,
        cardType: "insight" as DraftCardType,
        typeData: { type: "insight" },
      })),
      usage: ZERO_USAGE,
    }),
    ...overrides,
  };
}

export function createMockHighlightDraftGenerationServices(
  overrides?: Partial<HighlightDraftGenerationServiceContext>,
): HighlightDraftGenerationServiceContext {
  return {
    llm: createMockHighlightDraftLlm(),
    ...overrides,
  };
}

// Re-export base mocks for convenience
export {
  createMockEmbedder,
  createMockSummaryStore,
  createMockVectorStore,
} from "../../feed/logic/mocks";
