"use node";

import type {
  DraftGenerationServiceContext,
  EmbeddingServiceContext,
  ExtractionServiceContext,
  ParsingServiceContext,
  SummarizingServiceContext,
  TaggingServiceContext,
  ThematicDraftGenerationServiceContext,
  VectorDeletionServices,
} from "../providers/types";
import { AiSdkCardDraftLlm } from "../providers/cardDraftLlm";
import { AiSdkSummarizingLlm } from "../providers/summarizingLlm";
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
  return {
    llm: new AiSdkCardDraftLlm(),
  };
}

export function createThematicDraftGenerationServiceContext(): ThematicDraftGenerationServiceContext {
  return {
    thematicLlm: new AiSdkThematicLlm(),
    draftLlm: new AiSdkCardDraftLlm(),
    embedder: createEmbeddingProvider(),
    vectorStore: createVectorStore(),
  };
}
