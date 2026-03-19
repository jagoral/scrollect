"use node";

import { generateText, Output } from "ai";
import { ConvexError, v } from "convex/values";
import { z } from "zod";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { action } from "../_generated/server";
import { requireAuth } from "../lib/functions";
import type { TypeData } from "../lib/validators";
import { WideEvent } from "../lib/logging";
import { captureAiUsage, captureEvent } from "../providers/analytics";
import { getAI } from "../providers/ai";
import {
  createEmbeddingProvider,
  createSummaryVectorStore,
  createVectorStore,
} from "../pipeline/helpers";
import type { ConnectionPair } from "./discovery";
import { discoverConnections } from "./discovery";
import type {
  ChunkInfo,
  ChunkMetadata,
  DocumentSummaryInfo,
  PostSourceRecord,
  SectionSummaryInfo,
} from "./sampling";
import {
  buildChunkUsageMap,
  buildTypeCoverageHint,
  semanticSelect,
  weightedSample,
} from "./sampling";
import { interleaveCards } from "./interleaving";
import { buildSummaryContext, type LearningGoalEntry } from "./selectionLogic";
import {
  buildConnectionPairMap,
  enrichConnectionCard,
  mergeConnectionChunks,
} from "./connectionEnrichment";
import type { RawCard } from "./validation";
import { validateCard } from "./validation";

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const SATURATION_THRESHOLD = 0.8;

function buildMultiTypePrompt(chunkCount: number, cardCount: number): string {
  return `You are an AI learning assistant for Scrollect, a personal learning feed app.
Your job is to transform raw text chunks from documents into engaging, bite-sized learning cards of MIXED types.

Card types you MUST produce (aim for variety - use at least 3 different types):

1. **insight** - A concise insight or key takeaway (2-4 sentences). Use **bold** for key terms.
2. **quiz** - A question testing understanding. Include:
   - variant: "multiple_choice" or "true_false"
   - question: the question text
   - options: array of 4 choices (or 2 for true_false: ["True", "False"])
   - correctIndex: 0-based index of the correct option
   - explanation: brief explanation of the correct answer
3. **quote** - A notable quote from the source. Include:
   - quotedText: the exact quoted text
   - attribution: (optional) author or source name
4. **summary** - A bullet-point summary combining ideas from MULTIPLE chunks. Include:
   - bulletPoints: array of 2-5 bullet point strings
   - IMPORTANT: summaries MUST reference at least 2 different chunks via sourceChunkIndices
5. **connection** - Links concepts across different sources. Include:
   - sourceATitleHint: title/topic of the first source
   - sourceBTitleHint: title/topic of the second source
   - sourceAKeyIdea: one sentence describing the key idea from the first source that forms the connection
   - sourceBKeyIdea: one sentence describing the key idea from the second source that forms the connection
   - IMPORTANT: connections MUST reference at least 2 chunks via sourceChunkIndices
   - QUALITY GATE: Only create a connection if the relationship is genuinely insightful and non-obvious. If two chunks merely discuss the same topic without a deeper conceptual bridge, do NOT create a connection card - use a different type instead.

For ALL cards:
- content: 2-4 sentences of engaging text (the main card body)
- sourceChunkIndices: array of 0-based indices into the provided chunks that this card draws from

Return a JSON object: { "cards": [ { type, content, sourceChunkIndices, ...type-specific fields } ] }

Produce exactly ${cardCount} cards from the ${chunkCount} chunks provided. Ensure variety in types.`;
}

const cardsResponseSchema = z.object({
  cards: z.array(
    z
      .object({
        type: z.string(),
        content: z.string(),
        sourceChunkIndices: z.array(z.number()),
      })
      .passthrough(),
  ),
});

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

      const documents: {
        _id: Id<"documents">;
        title: string;
        createdAt: number;
        summary?: string;
        summaryEmbeddingId?: string;
        learningGoal?: string;
      }[] = await ctx.runQuery(internal.feed.queries.listReadyDocuments, { userId: user._id });
      evt.set("readyDocuments", documents.length);

      if (documents.length === 0) {
        throw new Error("No ready documents found. Upload and process a document first.");
      }

      const now = Date.now();
      const docMap = new Map<string, string>(documents.map((d) => [d._id, d.title]));
      const docCreatedAtMap = new Map<string, number>(documents.map((d) => [d._id, d.createdAt]));

      const metadataLoadStart = Date.now();
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
      evt.set("metadataLoadDurationMs", Date.now() - metadataLoadStart);

      const contentCache = new Map<string, string>();
      const fetchContent = async (chunkIds: string[]): Promise<Map<string, string>> => {
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
      };

      evt.set("totalChunks", allChunks.length);

      if (allChunks.length === 0) {
        throw new Error("No chunks available to generate feed from.");
      }

      const [recentSources, recentPosts, recentHashList] = await Promise.all([
        ctx.runQuery(internal.feed.queries.listRecentPostSources, {
          userId: user._id,
          sinceTs: now - NINETY_DAYS_MS,
        }) as Promise<PostSourceRecord[]>,
        ctx.runQuery(internal.feed.queries.listRecentPosts, {
          userId: user._id,
          sinceTs: now - NINETY_DAYS_MS,
        }) as Promise<{ _id: Id<"posts">; postType: string }[]>,
        ctx.runQuery(internal.feed.queries.listRecentChunkHashes, {
          userId: user._id,
          sinceTs: now - THIRTY_DAYS_MS,
        }),
      ]);

      const chunkUsageMap = buildChunkUsageMap(recentSources, recentPosts);
      const recentHashes = new Set(recentHashList);

      const usedChunkCount = chunkUsageMap.size;
      const saturationRatio = allChunks.length > 0 ? usedChunkCount / allChunks.length : 0;
      evt.set("saturationRatio", saturationRatio);
      if (saturationRatio > SATURATION_THRESHOLD) {
        evt.set("saturationWarning", true);
      }

      const sampleSize = Math.max(cardCount * 2, 10);

      const docSummaries: DocumentSummaryInfo[] = documents
        .filter((d) => d.summary && d.summaryEmbeddingId)
        .map((d) => ({
          documentId: d._id as string,
          documentTitle: d.title,
          summary: d.summary!,
          summaryEmbeddingId: d.summaryEmbeddingId!,
        }));

      const sectionArrays = await Promise.all(
        documents
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
      );
      const allSectionSummaries: SectionSummaryInfo[] = sectionArrays.flat();

      evt.set("docSummaries", docSummaries.length);
      evt.set("sectionSummaries", allSectionSummaries.length);

      const embedder = createEmbeddingProvider();

      let selected: ChunkMetadata[];
      if (docSummaries.length > 0) {
        const summaryStore = createSummaryVectorStore();
        selected = await semanticSelect({
          allChunks,
          docSummaries,
          chunkUsageMap,
          docCreatedAtMap,
          count: sampleSize,
          userId: user._id,
          embedder,
          summaryStore,
          now,
        });
        evt.set("selectionMethod", "semantic");
      } else {
        selected = weightedSample({
          chunks: allChunks,
          chunkUsageMap,
          docCreatedAtMap,
          count: sampleSize,
          now,
        });
        evt.set("selectionMethod", "weighted");
      }
      evt.set("selectedChunks", selected.length);
      evt.set("model", "fast");

      let connectionPairs: ConnectionPair[] = [];
      if (allChunks.length >= 2) {
        try {
          const vectorStore = createVectorStore();
          connectionPairs = await discoverConnections({
            allChunks,
            userId: user._id,
            embedder,
            vectorStore,
            fetchContent,
            maxPairs: Math.max(1, Math.floor(cardCount / 5)),
          });
          evt.set("connectionPairsFound", connectionPairs.length);
        } catch (error) {
          evt.set("connectionDiscoveryFailed", true);
          evt.set(
            "connectionDiscoveryError",
            error instanceof Error ? error.message : String(error),
          );
        }
      }

      const { merged: selectedWithConnections, connectionHints } = mergeConnectionChunks({
        selected,
        connectionPairs,
      });

      const hydrationStart = Date.now();
      const contentMap = await fetchContent(selectedWithConnections.map((c) => c._id));
      evt.set("contentHydrationDurationMs", Date.now() - hydrationStart);
      evt.set("hydratedChunks", contentMap.size);
      const missingChunks = selectedWithConnections.filter((c) => !contentMap.has(c._id));
      if (missingChunks.length > 0) {
        evt.set("missingChunksDuringHydration", missingChunks.length);
      }

      const hydratedChunks: ChunkInfo[] = selectedWithConnections.map((c) => ({
        ...c,
        content: contentMap.get(c._id) ?? "",
      }));

      const typeCoverageHint = buildTypeCoverageHint(chunkUsageMap);
      const systemPrompt =
        buildMultiTypePrompt(hydratedChunks.length, cardCount) + typeCoverageHint;

      const selectedDocIds = new Set(hydratedChunks.map((c) => c.documentId));

      const learningGoals = new Map<string, LearningGoalEntry>();
      for (const doc of documents) {
        if (doc.learningGoal) {
          learningGoals.set(doc._id, { title: doc.title, goal: doc.learningGoal });
        }
      }

      const summaryContext = buildSummaryContext({
        docSummaries,
        sectionSummaries: allSectionSummaries,
        selectedDocIds,
        learningGoals,
      });

      const userPrompt =
        summaryContext +
        hydratedChunks
          .map((chunk, i) => `Chunk ${i} (from "${chunk.documentTitle}"):\n${chunk.content}`)
          .join("\n\n---\n\n") +
        (connectionHints.length > 0
          ? `\n\n---\n\nDISCOVERED CONNECTIONS (use these to create connection cards):\n${connectionHints.join("\n")}`
          : "");

      const connectionPairMap = buildConnectionPairMap(connectionPairs, hydratedChunks);
      const documentCount = documents.length;

      let validCards: { card: RawCard; chunks: ChunkInfo[] }[] = [];
      let generationAttempts = 0;
      const maxBatchRetries = 2;
      const generationTokens = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

      while (validCards.length < cardCount && generationAttempts <= maxBatchRetries) {
        generationAttempts++;
        const { output, usage } = await generateText({
          model: getAI().languageModel("fast"),
          output: Output.object({ schema: cardsResponseSchema }),
          system: systemPrompt,
          prompt: userPrompt,
          temperature: 0.7,
          maxRetries: 2,
        });
        generationTokens.inputTokens += usage.inputTokens ?? 0;
        generationTokens.outputTokens += usage.outputTokens ?? 0;
        generationTokens.totalTokens += usage.totalTokens ?? 0;

        const cards = (output?.cards ?? []) as RawCard[];

        const validated: { card: RawCard; chunks: ChunkInfo[] }[] = [];
        const dropped: string[] = [];
        for (const card of cards) {
          if (validateCard({ card, chunks: hydratedChunks, documentCount })) {
            const cardChunks = card.sourceChunkIndices.map((i) => hydratedChunks[i]!);
            if (card.type === "connection") {
              enrichConnectionCard({ card, cardChunks, connectionPairMap });
              evt.set(
                "connectionKeyIdeasPresent",
                Boolean(card.sourceAKeyIdea && card.sourceBKeyIdea),
              );
            }
            validated.push({ card, chunks: cardChunks });
          } else {
            dropped.push(`${card.type ?? "unknown"}: missing fields`);
          }
        }

        evt.set(`attempt_${generationAttempts}_total`, cards.length);
        evt.set(`attempt_${generationAttempts}_valid`, validated.length);
        evt.set(`attempt_${generationAttempts}_dropped`, dropped.length);

        if (validated.length > 0 && cards.length > 0 && dropped.length / cards.length <= 0.5) {
          validCards = validated;
          break;
        }

        if (validated.length > validCards.length) {
          validCards = validated;
        }
      }

      evt.set("finalCardCount", validCards.length);

      let dedupSkipped = 0;
      const dedupedCards: { card: RawCard; chunks: ChunkInfo[] }[] = [];
      for (const entry of validCards.slice(0, cardCount)) {
        const candidateHash = entry.chunks
          .map((c) => c._id)
          .sort()
          .join("+");
        if (recentHashes.has(candidateHash)) {
          dedupSkipped++;
          continue;
        }
        recentHashes.add(candidateHash);
        dedupedCards.push(entry);
      }
      evt.set("dedupSkipped", dedupSkipped);

      const interleaved = interleaveCards({
        cards: dedupedCards,
        getType: (entry) => entry.card.type,
      });
      evt.set("interleavedCount", interleaved.length);

      // Insert in reverse so the first interleaved card (hook) is inserted last,
      // giving it the highest _creationTime. The feed query uses by_userId DESC,
      // so higher _creationTime = appears first. Do NOT replace with Promise.all
      // as that would lose deterministic ordering.
      const reversed = [...interleaved].reverse();

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

      captureAiUsage({
        distinctId: user._id,
        operation: "feed_generation",
        usage: generationTokens,
        model: "llm",
      });
      captureEvent({
        distinctId: user._id,
        event: "pipeline.cards_generated",
        properties: {
          card_count: postIds.length,
          selection_method: "multi_type",
        },
      });

      return postIds;
    } catch (error) {
      evt.setError(error);
      throw error;
    } finally {
      evt.emit();
    }
  },
});

function buildTypeData(card: RawCard): TypeData {
  switch (card.type) {
    case "insight":
      return { type: "insight" };
    case "quiz":
      return {
        type: "quiz",
        variant: (card.variant ?? "multiple_choice") as "multiple_choice" | "true_false",
        question: card.question!,
        options: card.options!,
        correctIndex: card.correctIndex!,
        explanation: card.explanation!,
      };
    case "quote":
      return {
        type: "quote",
        quotedText: card.quotedText!,
        ...(card.attribution ? { attribution: card.attribution } : {}),
      };
    case "summary":
      return {
        type: "summary",
        bulletPoints: card.bulletPoints!,
      };
    case "connection":
      return {
        type: "connection",
        sourceATitleHint: card.sourceATitleHint!,
        sourceBTitleHint: card.sourceBTitleHint!,
        sourceAKeyIdea: card.sourceAKeyIdea,
        sourceBKeyIdea: card.sourceBKeyIdea,
        similarityScore: card.similarityScore ?? 0,
        connectionType: card.connectionType ?? "cross_document",
      };
  }
}
