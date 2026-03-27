import { ZERO_USAGE } from "../../../src/providers/ai";
import type {
  AnalyticsService,
  CardGenerationService,
  ContentFetcher,
  EmbeddingProvider,
  FeedServiceContext,
  SummarySearchResult,
  SummaryVectorStore,
  VectorSearchResult,
  VectorStore,
} from "../../../src/providers/types";

export function createMockCardGenerator(
  overrides?: Partial<CardGenerationService>,
): CardGenerationService {
  return {
    generateCards: async () => ({ cards: [], usage: ZERO_USAGE }),
    ...overrides,
  };
}

export function createMockEmbedder(overrides?: Partial<EmbeddingProvider>): EmbeddingProvider {
  return {
    dimensions: 3,
    embed: async (texts: string[]) => texts.map(() => [0.1, 0.2, 0.3]),
    ...overrides,
  };
}

export function createMockVectorStore(overrides?: Partial<VectorStore>): VectorStore {
  return {
    ensureCollection: async () => {},
    upsert: async () => {},
    search: async (): Promise<VectorSearchResult[]> => [],
    searchExcludingDocument: async (): Promise<VectorSearchResult[]> => [],
    delete: async () => {},
    ...overrides,
  };
}

export function createMockSummaryStore(
  overrides?: Partial<SummaryVectorStore>,
): SummaryVectorStore {
  return {
    ensureCollection: async () => {},
    upsert: async () => {},
    search: async (): Promise<SummarySearchResult[]> => [],
    delete: async () => {},
    ...overrides,
  };
}

export function createNoopAnalytics(): AnalyticsService {
  return {
    captureEvent: async () => {},
    captureAiUsage: async () => {},
  };
}

export function createMapContentFetcher(data: Map<string, string>): ContentFetcher {
  return {
    fetchContent: async (chunkIds: string[]) => {
      const result = new Map<string, string>();
      for (const id of chunkIds) {
        const content = data.get(id);
        if (content) result.set(id, content);
      }
      return result;
    },
  };
}

export function createMockServices(overrides?: Partial<FeedServiceContext>): FeedServiceContext {
  return {
    cardGenerator: createMockCardGenerator(),
    embedder: createMockEmbedder(),
    vectorStore: createMockVectorStore(),
    summaryStore: createMockSummaryStore(),
    analytics: createNoopAnalytics(),
    contentFetcher: createMapContentFetcher(new Map()),
    ...overrides,
  };
}
