"use node";

import type { ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import type {
  AnalyticsService,
  CardGenerationService,
  ContentFetcher,
  EmbeddingProvider,
  SummaryVectorStore,
  VectorStore,
} from "../providers/types";
import { AiSdkCardGenerator } from "../providers/cardGeneration";
import { PostHogAnalyticsService } from "../providers/analyticsService";
import {
  createEmbeddingProvider,
  createSummaryVectorStore,
  createVectorStore,
} from "../pipeline/helpers";

export type FeedServiceContext = {
  cardGenerator: CardGenerationService;
  embedder: EmbeddingProvider;
  vectorStore: VectorStore;
  summaryStore: SummaryVectorStore;
  analytics: AnalyticsService;
  contentFetcher: ContentFetcher;
};

export function createFeedServiceContext(ctx: ActionCtx): FeedServiceContext {
  const contentCache = new Map<string, string>();

  return {
    cardGenerator: new AiSdkCardGenerator(),
    embedder: createEmbeddingProvider(),
    vectorStore: createVectorStore(),
    summaryStore: createSummaryVectorStore(),
    analytics: new PostHogAnalyticsService(),
    contentFetcher: {
      fetchContent: async (chunkIds: string[]): Promise<Map<string, string>> => {
        const uncached = chunkIds.filter((id) => !contentCache.has(id));
        if (uncached.length > 0) {
          const results = await ctx.runQuery(internal.feed.queries.getChunksByIds, {
            chunkIds: uncached as Id<"chunks">[],
          });
          for (let i = 0; i < uncached.length; i++) {
            const chunk = results[i];
            if (chunk) {
              contentCache.set(uncached[i]!, chunk.content);
            }
          }
        }
        const result = new Map<string, string>();
        for (const id of chunkIds) {
          const content = contentCache.get(id);
          if (content) {
            result.set(id, content);
          }
        }
        return result;
      },
    },
  };
}
