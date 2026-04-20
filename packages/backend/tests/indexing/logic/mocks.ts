import {
  createMockEmbedder,
  createMockSummaryStore,
  createMockVectorStore,
} from "../../feed/logic/mocks";
import { ZERO_USAGE } from "../../../src/providers/llm/models";
import type {
  ContentExtractor,
  EmbeddingServiceContext,
  ExtractResult,
  ExtractionServiceContext,
  SummarizingLlm,
  SummarizingServiceContext,
  TaggingLlm,
  TaggingServiceContext,
} from "../../../src/providers/types";

export function createMockSummarizingLlm(overrides?: Partial<SummarizingLlm>): SummarizingLlm {
  return {
    generateSectionSummary: async ({ sectionTitle }) => ({
      summary: `Summary of ${sectionTitle}`,
      isSubstantiveContent: true,
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

export {
  createMockEmbedder,
  createMockSummaryStore,
  createMockVectorStore,
} from "../../feed/logic/mocks";
