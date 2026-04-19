"use node";

import { AiSdkCardDraftLlm } from "../../src/providers/llm/cardDraftLlm";
import { AiSdkCardDraftValidator } from "../../src/providers/llm/cardDraftValidator";
import { AiSdkConnectionDiscoveryLlm } from "../../src/providers/llm/connectionDiscoveryLlm";
import { AiSdkHighlightDraftLlm } from "../../src/providers/llm/highlightDraftLlm";
import { AiSdkSectionDraftRankerLlm } from "../../src/providers/llm/sectionDraftRankerLlm";
import { AiSdkThematicLlm } from "../../src/providers/llm/thematicLlm";
import {
  StubCardDraftLlm,
  StubCardDraftValidator,
  StubConnectionDiscoveryLlm,
  StubHighlightDraftLlm,
  StubSectionDraftRankerLlm,
  StubThematicLlm,
} from "../../src/providers/stubs";
import type {
  ConnectionDiscoveryServiceContext,
  DraftGenerationServiceContext,
  HighlightDraftGenerationServiceContext,
  ThematicDraftGenerationServiceContext,
} from "../../src/providers/types";
import {
  createEmbeddingProvider,
  createSummaryVectorStore,
  createVectorStore,
} from "../../src/providers/wiring";

export function createDraftGenerationServiceContext(): DraftGenerationServiceContext {
  if (process.env.USE_STUB_EXTRACTORS === "true") {
    return {
      llm: new StubCardDraftLlm(),
      validator: new StubCardDraftValidator(),
      ranker: new StubSectionDraftRankerLlm(),
    };
  }
  return {
    llm: new AiSdkCardDraftLlm(),
    validator: new AiSdkCardDraftValidator(),
    ranker: new AiSdkSectionDraftRankerLlm(),
  };
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
