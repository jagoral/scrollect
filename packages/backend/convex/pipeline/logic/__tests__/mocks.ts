import {
  createMockEmbedder,
  createMockSummaryStore,
  createMockVectorStore,
} from "../../../feed/logic/__tests__/mocks";
import type {
  ContentExtractor,
  DocumentParser,
  EmbeddingServiceContext,
  ExtractResult,
  ExtractionServiceContext,
  ParsingServiceContext,
  PollResult,
  SummarizingLlm,
  SummarizingServiceContext,
  TaggingLlm,
  TaggingServiceContext,
  TokenUsage,
} from "../../../providers/types";

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
      metadata: { provider: "supadata" },
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

// Re-export base mocks for convenience
export {
  createMockEmbedder,
  createMockSummaryStore,
  createMockVectorStore,
} from "../../../feed/logic/__tests__/mocks";
