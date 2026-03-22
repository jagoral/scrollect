"use node";

import { ConvexError, v } from "convex/values";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { action } from "../_generated/server";
import type { ActionCtx } from "../_generated/server";
import { requireAuth } from "../lib/functions";
import { WideEvent } from "../lib/logging";
import type { ChunkMetadata, PostSourceRecord, SectionSummaryInfo } from "./logic/sampling";
import { generateFeed, buildTypeData } from "./logic/generateFeed";
import type { FeedInputData } from "./logic/generateFeed";
import { createFeedServiceContext } from "./services";

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export const generate = action({
  args: { count: v.optional(v.number()) },
  handler: async (ctx, args): Promise<Id<"posts">[]> => {
    const cardCount = args.count ?? 5;
    const evt = new WideEvent("feedGeneration.generate");

    try {
      const user = await requireAuth(ctx);
      evt.set("userId", user._id);

      const rateLimitResult = await ctx.runMutation(
        internal.lib.rateLimitChecks.enforceFeedGenerationLimit,
        { userId: user._id },
      );
      if (!rateLimitResult.ok) {
        evt.set({
          rateLimited: true,
          endpoint: "feedGeneration",
          retryAfterMs: rateLimitResult.retryAfter,
        });
        throw new ConvexError({
          kind: "RateLimited" as const,
          name: "feedGeneration",
          retryAfter: rateLimitResult.retryAfter,
        });
      }

      const services = createFeedServiceContext(ctx);
      const data = await loadFeedData(ctx, user._id);
      evt.set("readyDocuments", data.documents.length);
      evt.set("totalChunks", data.allChunks.length);

      if (data.documents.length === 0) {
        throw new Error("No ready documents found. Upload and process a document first.");
      }

      const result = await generateFeed({ data, services, cardCount });
      evt.set(result.metrics);

      const docMap = new Map<string, string>(data.documents.map((d) => [d._id, d.title]));

      // Insert in reverse so the first interleaved card (hook) is inserted last,
      // giving it the highest _creationTime. The feed query uses by_userId DESC,
      // so higher _creationTime = appears first. Do NOT replace with Promise.all
      // as that would lose deterministic ordering.
      const reversed = [...result.cards].reverse();

      const postIds: Id<"posts">[] = [];
      for (const { card, chunks: cardChunks } of reversed) {
        const primaryChunk = cardChunks[0]!;
        const id = await ctx.runMutation(internal.feed.queries.insertPost, {
          content: card.content,
          postType: card.type,
          typeData: buildTypeData(card),
          primarySourceDocumentId: primaryChunk.documentId as Id<"documents">,
          primarySourceDocumentTitle: docMap.get(primaryChunk.documentId) ?? "Unknown",
          primarySourceChunkId: primaryChunk._id as Id<"chunks">,
          primarySourceSectionTitle: primaryChunk.sectionTitle,
          primarySourcePageNumber: primaryChunk.pageNumber,
          sourceChunkIds: cardChunks.map((c) => c._id as Id<"chunks">),
          sourceDocumentIds: cardChunks.map((c) => c.documentId as Id<"documents">),
          userId: user._id,
        });
        postIds.push(id);
      }
      postIds.reverse();

      await Promise.all([
        services.analytics.captureAiUsage({
          distinctId: user._id,
          operation: "feed_generation",
          usage: result.tokenUsage,
          modelType: "llm",
        }),
        services.analytics.captureEvent({
          distinctId: user._id,
          event: "feed.cards_generated",
          properties: {
            card_count: postIds.length,
            selection_method: result.selectionMethod,
          },
        }),
      ]);

      return postIds;
    } catch (error) {
      evt.setError(error);
      throw error;
    } finally {
      evt.emit();
    }
  },
});

async function loadFeedData(ctx: ActionCtx, userId: string): Promise<FeedInputData> {
  const documents = await ctx.runQuery(internal.feed.queries.listReadyDocuments, { userId });
  const now = Date.now();

  const metadataArrays = await Promise.all(
    documents.map(async (doc) => {
      const chunks = await ctx.runQuery(internal.feed.queries.listChunkMetadataForDocument, {
        documentId: doc._id,
      });
      return chunks.map((chunk) => ({
        _id: chunk._id as string,
        documentId: doc._id as string,
        documentTitle: doc.title,
        sectionTitle: chunk.sectionTitle,
        pageNumber: chunk.pageNumber,
        chunkIndex: chunk.chunkIndex,
      }));
    }),
  );
  const allChunks: ChunkMetadata[] = metadataArrays.flat();

  const [recentSources, recentPosts, recentHashList, ...sectionArrays] = await Promise.all([
    ctx.runQuery(internal.feed.queries.listRecentPostSources, {
      userId,
      sinceTs: now - NINETY_DAYS_MS,
    }) as Promise<PostSourceRecord[]>,
    ctx.runQuery(internal.feed.queries.listRecentPosts, {
      userId,
      sinceTs: now - NINETY_DAYS_MS,
    }) as Promise<{ _id: string; postType: string }[]>,
    ctx.runQuery(internal.feed.queries.listRecentChunkHashes, {
      userId,
      sinceTs: now - THIRTY_DAYS_MS,
    }),
    ...documents
      .filter((doc) => doc.summary)
      .map(async (doc) => {
        const sections = await ctx.runQuery(internal.feed.queries.listSectionSummaries, {
          documentId: doc._id,
        });
        return sections.map((s) => ({
          documentId: doc._id as string,
          sectionTitle: s.sectionTitle,
          summary: s.summary,
          chunkStartIndex: s.chunkStartIndex,
          chunkEndIndex: s.chunkEndIndex,
        }));
      }),
  ]);

  const allSectionSummaries: SectionSummaryInfo[] = (
    sectionArrays as SectionSummaryInfo[][]
  ).flat();

  return {
    documents: documents.map((d) => ({
      _id: d._id as string,
      title: d.title,
      createdAt: d.createdAt,
      summary: d.summary,
      summaryEmbeddingId: d.summaryEmbeddingId,
      learningGoal: d.learningGoal,
    })),
    allChunks,
    recentSources,
    recentPosts,
    recentHashes: new Set(recentHashList as string[]),
    sectionSummaries: allSectionSummaries,
    userId: userId as string,
    now,
  };
}
