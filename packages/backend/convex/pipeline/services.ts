"use node";

import type {
  ConnectionDiscoveryServiceContext,
  DraftGenerationServiceContext,
  EmbeddingServiceContext,
  ExtractionServiceContext,
  HighlightDraftGenerationServiceContext,
  ParsingServiceContext,
  SummarizingServiceContext,
  TaggingServiceContext,
  ThematicDraftGenerationServiceContext,
  VectorDeletionServices,
} from "../providers/types";
import { AiSdkCardDraftLlm } from "../providers/cardDraftLlm";
import { AiSdkConnectionDiscoveryLlm } from "../providers/connectionDiscoveryLlm";
import { AiSdkHighlightDraftLlm } from "../providers/highlightDraftLlm";
import { AiSdkSummarizingLlm } from "../providers/summarizingLlm";
import {
  StubCardDraftLlm,
  StubConnectionDiscoveryLlm,
  StubHighlightDraftLlm,
  StubThematicLlm,
} from "../providers/stubs";
import { AiSdkTaggingLlm } from "../providers/taggingLlm";
import { AiSdkThematicLlm } from "../providers/thematicLlm";

import {
  createArticleExtractor,
  createDocumentParser,
  createEmbeddingProvider,
  createSummaryVectorStore,
  createVectorStore,
  createYouTubeExtractor,
} from "./helpers";

export function createSummarizingServiceContext(): SummarizingServiceContext {
  return {
    llm: new AiSdkSummarizingLlm(),
    embedder: createEmbeddingProvider(),
    summaryStore: createSummaryVectorStore(),
  };
}

export function createEmbeddingServiceContext(): EmbeddingServiceContext {
  return {
    embedder: createEmbeddingProvider(),
    vectorStore: createVectorStore(),
  };
}

export function createParsingServiceContext(): ParsingServiceContext {
  return {
    parser: createDocumentParser(),
  };
}

export function createExtractionServiceContext(): ExtractionServiceContext {
  return {
    articleExtractor: createArticleExtractor(),
    youtubeExtractor: createYouTubeExtractor(),
  };
}

export function createTaggingServiceContext(): TaggingServiceContext {
  return {
    llm: new AiSdkTaggingLlm(),
  };
}

export function createVectorDeletionServices(): VectorDeletionServices {
  return {
    vectorStore: createVectorStore(),
    summaryStore: createSummaryVectorStore(),
  };
}

export function createDraftGenerationServiceContext(): DraftGenerationServiceContext {
  if (process.env.USE_STUB_EXTRACTORS === "true") {
    return { llm: new StubCardDraftLlm() };
  }
  return { llm: new AiSdkCardDraftLlm() };
}

export function createThematicDraftGenerationServiceContext(): ThematicDraftGenerationServiceContext {
  if (process.env.USE_STUB_EXTRACTORS === "true") {
    return {
      thematicLlm: new StubThematicLlm(),
      draftLlm: new StubCardDraftLlm(),
      embedder: createEmbeddingProvider(),
      vectorStore: createVectorStore(),
    };
  }
  return {
    thematicLlm: new AiSdkThematicLlm(),
    draftLlm: new AiSdkCardDraftLlm(),
    embedder: createEmbeddingProvider(),
    vectorStore: createVectorStore(),
  };
}

export function createConnectionDiscoveryServiceContext(): ConnectionDiscoveryServiceContext {
  if (process.env.USE_STUB_EXTRACTORS === "true") {
    return {
      llm: new StubConnectionDiscoveryLlm(),
      summaryStore: createSummaryVectorStore(),
      embedder: createEmbeddingProvider(),
    };
  }
  return {
    llm: new AiSdkConnectionDiscoveryLlm(),
    summaryStore: createSummaryVectorStore(),
    embedder: createEmbeddingProvider(),
  };
}

export function createHighlightDraftGenerationServiceContext(): HighlightDraftGenerationServiceContext {
  if (process.env.USE_STUB_EXTRACTORS === "true") {
    return { llm: new StubHighlightDraftLlm() };
  }
  return { llm: new AiSdkHighlightDraftLlm() };
}
