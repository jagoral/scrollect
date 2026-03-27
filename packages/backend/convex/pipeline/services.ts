"use node";

import type {
  ConnectionDiscoveryServiceContext,
  DraftGenerationServiceContext,
  EmbeddingServiceContext,
  ExtractionServiceContext,
  HighlightDraftGenerationServiceContext,
  SummarizingServiceContext,
  TaggingServiceContext,
  ThematicDraftGenerationServiceContext,
  VectorDeletionServices,
} from "../../src/providers/types";
import { AiSdkCardDraftLlm } from "../../src/providers/cardDraftLlm";
import { AiSdkCardDraftValidator } from "../../src/providers/cardDraftValidator";
import { AiSdkConnectionDiscoveryLlm } from "../../src/providers/connectionDiscoveryLlm";
import { AiSdkHighlightDraftLlm } from "../../src/providers/highlightDraftLlm";
import { AiSdkSummarizingLlm } from "../../src/providers/summarizingLlm";
import {
  StubCardDraftLlm,
  StubCardDraftValidator,
  StubConnectionDiscoveryLlm,
  StubHighlightDraftLlm,
  StubThematicLlm,
} from "../../src/providers/stubs";
import { AiSdkTaggingLlm } from "../../src/providers/taggingLlm";
import { AiSdkThematicLlm } from "../../src/providers/thematicLlm";

import {
  createArticleExtractor,
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
    return { llm: new StubCardDraftLlm(), validator: new StubCardDraftValidator() };
  }
  return { llm: new AiSdkCardDraftLlm(), validator: new AiSdkCardDraftValidator() };
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
