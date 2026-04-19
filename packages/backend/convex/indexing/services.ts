"use node";

import {
  AiSdkDocumentMetadataLlm,
  StubDocumentMetadataLlm,
} from "../../src/providers/llm/documentMetadataLlm";
import { AiSdkSummarizingLlm } from "../../src/providers/llm/summarizingLlm";
import { AiSdkTaggingLlm } from "../../src/providers/llm/taggingLlm";
import type {
  DocumentMetadataServiceContext,
  EmbeddingServiceContext,
  ExtractionServiceContext,
  SummarizingServiceContext,
  TaggingServiceContext,
} from "../../src/providers/types";
import {
  createArticleExtractor,
  createEmbeddingProvider,
  createSummaryVectorStore,
  createVectorStore,
  createYouTubeExtractor,
} from "../../src/providers/wiring";

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

export function createDocumentMetadataServiceContext(): DocumentMetadataServiceContext {
  if (process.env.USE_STUB_EXTRACTORS === "true") {
    return { llm: new StubDocumentMetadataLlm() };
  }
  return { llm: new AiSdkDocumentMetadataLlm() };
}
