"use node";

import { AiSdkPostDraftLlm } from "../../src/providers/llm/postDraftLlm";
import { AiSdkPostDraftValidator } from "../../src/providers/llm/postDraftValidator";
import { AiSdkConnectionDiscoveryLlm } from "../../src/providers/llm/connectionDiscoveryLlm";
import { AiSdkHighlightDraftLlm } from "../../src/providers/llm/highlightDraftLlm";
import { AiSdkSectionDraftRankerLlm } from "../../src/providers/llm/sectionDraftRankerLlm";
import { AiSdkThematicLlm } from "../../src/providers/llm/thematicLlm";
import {
  StubPostDraftLlm,
  StubPostDraftValidator,
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
      llm: new StubPostDraftLlm(),
      validator: new StubPostDraftValidator(),
      ranker: new StubSectionDraftRankerLlm(),
    };
  }
  return {
    llm: new AiSdkPostDraftLlm(),
    validator: new AiSdkPostDraftValidator(),
    ranker: new AiSdkSectionDraftRankerLlm(),
  };
}

export function createThematicDraftGenerationServiceContext(): ThematicDraftGenerationServiceContext {
  if (process.env.USE_STUB_EXTRACTORS === "true") {
    return {
      thematicLlm: new StubThematicLlm(),
      draftLlm: new StubPostDraftLlm(),
      embedder: createEmbeddingProvider(),
      vectorStore: createVectorStore(),
    };
  }
  return {
    thematicLlm: new AiSdkThematicLlm(),
    draftLlm: new AiSdkPostDraftLlm(),
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
