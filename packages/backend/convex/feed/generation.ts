"use node";

import { generateText, Output } from "ai";
import { v } from "convex/values";
import { z } from "zod";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { action } from "../_generated/server";
import { requireAuth } from "../lib/functions";
import type { TypeData } from "../lib/validators";
import { WideEvent } from "../lib/logging";
import { ai } from "../providers/ai";
import { createEmbeddingProvider, createSummaryVectorStore } from "../pipeline/helpers";
import type {
  ChunkInfo,
  DocumentSummaryInfo,
  PostSourceRecord,
  SectionSummaryInfo,
} from "./sampling";
import {
  buildChunkUsageMap,
  buildTypeCoverageHint,
  semanticSelect,
  shuffle,
  weightedSample,
} from "./sampling";
import { buildSummaryContext } from "./selectionLogic";
import type { RawCard } from "./validation";
import { validateCard } from "./validation";

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const SATURATION_THRESHOLD = 0.8;

function buildMultiTypePrompt(chunkCount: number, cardCount: number): string {
  return `You are an AI learning assistant for Scrollect, a personal learning feed app.
Your job is to transform raw text chunks from documents into engaging, bite-sized learning cards of MIXED types.

Card types you MUST produce (aim for variety — use at least 3 different types):

1. **insight** — A concise insight or key takeaway (2-4 sentences). Use **bold** for key terms.
2. **quiz** — A question testing understanding. Include:
   - variant: "multiple_choice" or "true_false"
   - question: the question text
   - options: array of 4 choices (or 2 for true_false: ["True", "False"])
   - correctIndex: 0-based index of the correct option
   - explanation: brief explanation of the correct answer
3. **quote** — A notable quote from the source. Include:
   - quotedText: the exact quoted text
   - attribution: (optional) author or source name
4. **summary** — A bullet-point summary combining ideas from MULTIPLE chunks. Include:
   - bulletPoints: array of 2-5 bullet point strings
   - IMPORTANT: summaries MUST reference at least 2 different chunks via sourceChunkIndices
5. **connection** — Links concepts across DIFFERENT documents. Include:
   - sourceATitleHint: title/topic of the first source
   - sourceBTitleHint: title/topic of the second source
   - IMPORTANT: connections MUST reference chunks from at least 2 different documents via sourceChunkIndices

For ALL cards:
- content: 2-4 sentences of engaging text (the main card body)
- sourceChunkIndices: array of 0-based indices into the provided chunks that this card draws from

Return a JSON object: { "cards": [ { type, content, sourceChunkIndices, ...type-specific fields } ] }

Produce exactly ${cardCount} cards from the ${chunkCount} chunks provided. Ensure variety in types.`;
}

function buildLegacyPrompt(chunkCount: number): string {
  return `You are an AI learning assistant for Scrollect, a personal learning feed app.
Your job is to transform raw text chunks from documents into engaging, bite-sized learning cards.

Each card should:
- Be concise (2-4 sentences)
- Highlight one key insight, fact, or concept
- Be written in a clear, engaging tone
- Stand on its own without needing additional context
- Use light Markdown formatting: **bold** for key terms, and occasional bullet points when listing related ideas

Return a JSON object with a "posts" key containing an array of exactly ${chunkCount} strings, one for each input chunk.`;
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

const postsResponseSchema = z.object({
  posts: z.array(z.string()),
});

export const generate = action({
  args: { count: v.optional(v.number()) },
  handler: async (ctx, args): Promise<Id<"posts">[]> => {
    const cardCount = args.count ?? 5;
    const evt = new WideEvent("feedGeneration.generate");
    const useMultiType = process.env.MULTI_TYPE_GENERATION !== "false";
    evt.set("multiTypeEnabled", useMultiType);

    try {
      const user = await requireAuth(ctx);
      evt.set("userId", user._id);

      const documents: {
        _id: Id<"documents">;
        title: string;
        createdAt: number;
        summary?: string;
        summaryEmbeddingId?: string;
      }[] = await ctx.runQuery(internal.feed.queries.listReadyDocuments, { userId: user._id });
      evt.set("readyDocuments", documents.length);

      if (documents.length === 0) {
        throw new Error("No ready documents found. Upload and process a document first.");
      }

      const now = Date.now();
      const docMap = new Map<string, string>(documents.map((d) => [d._id, d.title]));
      const docCreatedAtMap = new Map<string, number>(documents.map((d) => [d._id, d.createdAt]));

      const chunkArrays = await Promise.all(
        documents.map(async (doc) => {
          const chunks = await ctx.runQuery(internal.feed.queries.listChunksForDocument, {
            documentId: doc._id,
          });
          return chunks.map((chunk) => ({
            _id: chunk._id,
            content: chunk.content,
            documentId: doc._id,
            documentTitle: doc.title,
            sectionTitle: chunk.sectionTitle,
            pageNumber: chunk.pageNumber,
          }));
        }),
      );
      const allChunks: ChunkInfo[] = chunkArrays.flat();

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

      let selected: ChunkInfo[];
      if (useMultiType && docSummaries.length > 0) {
        const embedder = createEmbeddingProvider();
        const summaryStore = createSummaryVectorStore();
        selected = await semanticSelect({
          allChunks,
          docSummaries,
          chunkUsageMap,
          count: sampleSize,
          userId: user._id,
          embedder,
          summaryStore,
        });
        evt.set("selectionMethod", "semantic");
      } else if (useMultiType) {
        selected = weightedSample({
          chunks: allChunks,
          chunkUsageMap,
          docCreatedAtMap,
          count: sampleSize,
          now,
        });
        evt.set("selectionMethod", "weighted");
      } else {
        selected = shuffle(allChunks).slice(0, sampleSize);
        evt.set("selectionMethod", "random");
      }
      evt.set("selectedChunks", selected.length);

      evt.set("model", "fast");

      if (!useMultiType) {
        return await generateLegacy({
          ctx,
          selected,
          documents,
          userId: user._id,
          cardCount,
          evt,
        });
      }

      const typeCoverageHint = buildTypeCoverageHint(chunkUsageMap);
      const systemPrompt = buildMultiTypePrompt(selected.length, cardCount) + typeCoverageHint;

      const selectedDocIds = new Set(selected.map((c) => c.documentId));
      const summaryContext = buildSummaryContext({
        docSummaries,
        sectionSummaries: allSectionSummaries,
        selectedDocIds,
      });

      const userPrompt =
        summaryContext +
        selected
          .map((chunk, i) => `Chunk ${i} (from "${chunk.documentTitle}"):\n${chunk.content}`)
          .join("\n\n---\n\n");

      let validCards: { card: RawCard; chunks: ChunkInfo[] }[] = [];
      let generationAttempts = 0;
      const maxBatchRetries = 2;

      while (validCards.length < cardCount && generationAttempts <= maxBatchRetries) {
        generationAttempts++;
        const { output } = await generateText({
          model: ai.languageModel("fast"),
          output: Output.object({ schema: cardsResponseSchema }),
          system: systemPrompt,
          prompt: userPrompt,
          temperature: 0.7,
          maxRetries: 2,
        });

        const cards = (output?.cards ?? []) as RawCard[];

        const validated: { card: RawCard; chunks: ChunkInfo[] }[] = [];
        const dropped: string[] = [];
        for (const card of cards) {
          if (validateCard(card, selected)) {
            const cardChunks = card.sourceChunkIndices.map((i) => selected[i]!);
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

      const postIds: Id<"posts">[] = [];
      let dedupSkipped = 0;
      for (const { card, chunks: cardChunks } of validCards.slice(0, cardCount)) {
        const candidateHash = cardChunks
          .map((c) => c._id)
          .sort()
          .join("+");
        if (recentHashes.has(candidateHash)) {
          dedupSkipped++;
          continue;
        }
        recentHashes.add(candidateHash);

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
      evt.set("dedupSkipped", dedupSkipped);

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
      };
  }
}

type LegacyGenerateArgs = {
  ctx: ActionCtx;
  selected: ChunkInfo[];
  documents: { _id: Id<"documents">; title: string }[];
  userId: string;
  cardCount: number;
  evt: WideEvent;
};

async function generateLegacy(args: LegacyGenerateArgs): Promise<Id<"posts">[]> {
  const { ctx, selected, documents, userId, cardCount, evt } = args;
  const systemPrompt = buildLegacyPrompt(Math.min(selected.length, cardCount));
  const subset = selected.slice(0, cardCount);
  const userPrompt = subset
    .map((chunk, i) => `Chunk ${i + 1}:\n${chunk.content}`)
    .join("\n\n---\n\n");

  const { output } = await generateText({
    model: ai.languageModel("fast"),
    output: Output.object({ schema: postsResponseSchema }),
    system: systemPrompt,
    prompt: userPrompt,
    temperature: 0.7,
    maxRetries: 2,
  });

  const posts = output?.posts ?? [];

  evt.set("postsGenerated", posts.length);

  const postIds: Id<"posts">[] = [];
  for (let i = 0; i < posts.length; i++) {
    const chunk = subset[i]!;
    const content = posts[i]!;
    const doc = documents.find((d) => d._id === chunk.documentId);
    const id = await ctx.runMutation(internal.feed.queries.insertPost, {
      content,
      postType: "insight",
      typeData: { type: "insight" },
      primarySourceDocumentId: chunk.documentId as Id<"documents">,
      primarySourceDocumentTitle: doc?.title ?? "Unknown",
      primarySourceChunkId: chunk._id as Id<"chunks">,
      primarySourceSectionTitle: chunk.sectionTitle,
      primarySourcePageNumber: chunk.pageNumber,
      sourceChunkIds: [chunk._id as Id<"chunks">],
      sourceDocumentIds: [chunk.documentId as Id<"documents">],
      userId,
    });
    postIds.push(id);
  }

  return postIds;
}
