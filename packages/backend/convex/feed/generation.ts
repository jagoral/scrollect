"use node";

import { ConvexError, v } from "convex/values";
import { chunk as chunked, keyBy } from "es-toolkit";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { action } from "../_generated/server";
import type { ActionCtx } from "../_generated/server";
import { requireAuth } from "../lib/functions";
import { WideEvent } from "../lib/logging";
import type { ChunkMetadata, PostSourceRecord, SectionSummaryInfo } from "./logic/sampling";
import { generateFeed, buildTypeData } from "./logic/generateFeed";
import type { FeedInputData, HighlightLike, ValidatedCard } from "./logic/generateFeed";
import { matchHighlightsToChunks } from "./logic/highlightMatching";
import { createFeedServiceContext } from "./services";

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const CHUNK_BATCH_SIZE = 200;

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
      evt.set("totalHighlights", data.highlights.length);

      if (data.documents.length === 0) {
        throw new Error("No ready documents found. Upload and process a document first.");
      }

      const result = await generateFeed({ data, services, cardCount });
      evt.set(result.metrics);

      const docLookup = keyBy(data.documents, (d) => d._id);
      const postIds = await insertPostsSequentially(ctx, {
        cards: result.cards,
        docLookup,
        userId: user._id,
      });

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

async function insertPostsSequentially(
  ctx: ActionCtx,
  opts: {
    cards: ValidatedCard[];
    docLookup: Record<string, { _id: string; title: string }>;
    userId: string;
  },
): Promise<Id<"posts">[]> {
  // Insert in reverse so the first interleaved card (hook) is inserted last,
  // giving it the highest _creationTime. The feed query uses by_userId DESC,
  // so higher _creationTime = appears first. Do NOT replace with Promise.all
  // as that would lose deterministic ordering.
  const reversed = [...opts.cards].reverse();

  const postIds: Id<"posts">[] = [];
  for (const { card, chunks: cardChunks } of reversed) {
    const primaryChunk = cardChunks[0]!;
    const id = await ctx.runMutation(internal.feed.queries.insertPost, {
      content: card.content,
      postType: card.type,
      typeData: buildTypeData(card),
      primarySourceDocumentId: primaryChunk.documentId as Id<"documents">,
      primarySourceDocumentTitle: opts.docLookup[primaryChunk.documentId]?.title ?? "Unknown",
      primarySourceChunkId: primaryChunk._id as Id<"chunks">,
      primarySourceSectionTitle: primaryChunk.sectionTitle,
      primarySourcePageNumber: primaryChunk.pageNumber,
      sourceChunkIds: cardChunks.map((c) => c._id as Id<"chunks">),
      sourceDocumentIds: cardChunks.map((c) => c.documentId as Id<"documents">),
      userId: opts.userId,
    });
    postIds.push(id);
  }

  postIds.reverse();
  return postIds;
}

async function loadFeedData(ctx: ActionCtx, userId: string): Promise<FeedInputData> {
  const documents = await ctx.runQuery(internal.feed.queries.listReadyDocuments, { userId });
  const now = Date.now();

  const allChunks = await loadChunkMetadata(ctx, documents);

  const [recentSources, recentPosts, recentHashList, allHighlights, sectionSummaries] =
    await Promise.all([
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
      ctx.runQuery(internal.feed.queries.listHighlightsForDocuments, {
        userId,
        documentIds: documents.map((d) => d._id),
      }),
      loadSectionSummaries(ctx, documents),
    ]);

  const typedHighlights = allHighlights as HighlightLike[];
  const highlightedChunkIds = await resolveHighlightedChunks(ctx, {
    highlights: typedHighlights,
    allChunks,
  });

  return {
    documents: documents.map((d) => ({
      _id: d._id as string,
      title: d.title,
      createdAt: d.createdAt,
      language: d.language,
      summary: d.summary,
      summaryEmbeddingId: d.summaryEmbeddingId,
      learningGoal: d.learningGoal,
    })),
    allChunks,
    recentSources,
    recentPosts,
    recentHashes: new Set(recentHashList as string[]),
    sectionSummaries,
    highlights: typedHighlights,
    highlightedChunkIds,
    userId: userId as string,
    now,
  };
}

async function loadChunkMetadata(
  ctx: ActionCtx,
  documents: Array<{ _id: Id<"documents">; title: string }>,
): Promise<ChunkMetadata[]> {
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
  return metadataArrays.flat();
}

async function loadSectionSummaries(
  ctx: ActionCtx,
  documents: Array<{ _id: Id<"documents">; summary?: string }>,
): Promise<SectionSummaryInfo[]> {
  const docsWithSummaries = documents.filter((doc) => doc.summary);

  const sectionArrays = await Promise.all(
    docsWithSummaries.map(async (doc) => {
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
  );

  return sectionArrays.flat();
}

async function resolveHighlightedChunks(
  ctx: ActionCtx,
  opts: { highlights: HighlightLike[]; allChunks: ChunkMetadata[] },
): Promise<Set<string> | undefined> {
  if (opts.highlights.length === 0) return undefined;

  const highlightedDocIds = new Set(opts.highlights.map((h) => h.documentId));
  const candidateChunkIds = opts.allChunks
    .filter((c) => highlightedDocIds.has(c.documentId))
    .map((c) => c._id);

  if (candidateChunkIds.length === 0) return undefined;

  const chunkContents = await fetchChunkContentsBatched(ctx, candidateChunkIds);

  return matchHighlightsToChunks({
    highlights: opts.highlights,
    allChunks: opts.allChunks,
    chunkContents,
  });
}

async function fetchChunkContentsBatched(
  ctx: ActionCtx,
  chunkIds: string[],
): Promise<Array<{ id: string; content: string }>> {
  const batches = chunked(chunkIds, CHUNK_BATCH_SIZE);
  const results = (
    await Promise.all(
      batches.map((batch) =>
        ctx.runQuery(internal.feed.queries.getChunksByIds, {
          chunkIds: batch as unknown as Id<"chunks">[],
        }),
      ),
    )
  ).flat();

  return chunkIds
    .map((id, i) => {
      const chunk = results[i];
      return chunk ? { id, content: chunk.content } : null;
    })
    .filter((item): item is { id: string; content: string } => item !== null);
}
