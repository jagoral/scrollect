"use node";

import OpenAI from "openai";
import { v } from "convex/values";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { action } from "../_generated/server";
import { requireAuth } from "../lib/functions";
import type { TypeData } from "../lib/validators";
import { WideEvent } from "../lib/logging";
import type { ChunkInfo, PostSourceRecord } from "./sampling";
import { buildChunkUsageMap, buildTypeCoverageHint, shuffle, weightedSample } from "./sampling";
import type { RawCard } from "./validation";
import { validateCard } from "./validation";

const MAX_GENERATION_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 2000;
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const SATURATION_THRESHOLD = 0.8;

function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY environment variable is required");
  }
  return new OpenAI({ apiKey });
}

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

async function callWithRetry(
  openai: OpenAI,
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  model: string,
  evt: WideEvent,
): Promise<string> {
  for (let attempt = 0; attempt <= MAX_GENERATION_RETRIES; attempt++) {
    try {
      const response = await openai.chat.completions.create({
        model,
        messages,
        temperature: 0.7,
        response_format: { type: "json_object" },
      });
      return response.choices[0]?.message?.content ?? "{}";
    } catch (error: unknown) {
      const status = (error as { status?: number }).status ?? 0;
      const isRetryable =
        error instanceof Error &&
        (error.message.includes("rate_limit") ||
          error.message.includes("timeout") ||
          status === 429 ||
          status >= 500);

      if (!isRetryable || attempt === MAX_GENERATION_RETRIES) {
        throw error;
      }

      const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
      evt.set(`retry_${attempt}`, delay);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw new Error("Exhausted retries");
}

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

      const documents: { _id: Id<"documents">; title: string; createdAt: number }[] =
        await ctx.runQuery(internal.feed.queries.listReadyDocuments, { userId: user._id });
      evt.set("readyDocuments", documents.length);

      if (documents.length === 0) {
        throw new Error("No ready documents found. Upload and process a document first.");
      }

      const now = Date.now();
      const docMap = new Map<string, string>(documents.map((d) => [d._id, d.title]));
      const docCreatedAtMap = new Map<string, number>(documents.map((d) => [d._id, d.createdAt]));

      const allChunks: ChunkInfo[] = [];
      for (const doc of documents) {
        const chunks = await ctx.runQuery(internal.feed.queries.listChunksForDocument, {
          documentId: doc._id,
        });
        for (const chunk of chunks) {
          allChunks.push({
            _id: chunk._id,
            content: chunk.content,
            documentId: doc._id,
            documentTitle: doc.title,
            sectionTitle: chunk.sectionTitle,
            pageNumber: chunk.pageNumber,
          });
        }
      }

      evt.set("totalChunks", allChunks.length);

      if (allChunks.length === 0) {
        throw new Error("No chunks available to generate feed from.");
      }

      const recentSources: PostSourceRecord[] = await ctx.runQuery(
        internal.feed.queries.listRecentPostSources,
        { userId: user._id, sinceTs: now - NINETY_DAYS_MS },
      );

      const recentPosts: { _id: Id<"posts">; postType: string }[] = await ctx.runQuery(
        internal.feed.queries.listRecentPosts,
        {
          userId: user._id,
          sinceTs: now - NINETY_DAYS_MS,
        },
      );

      const chunkUsageMap = buildChunkUsageMap(recentSources, recentPosts);

      const usedChunkCount = chunkUsageMap.size;
      const saturationRatio = allChunks.length > 0 ? usedChunkCount / allChunks.length : 0;
      evt.set("saturationRatio", saturationRatio);
      if (saturationRatio > SATURATION_THRESHOLD) {
        evt.set("saturationWarning", true);
      }

      const recentHashes = new Set(
        await ctx.runQuery(internal.feed.queries.listRecentChunkHashes, {
          userId: user._id,
          sinceTs: now - THIRTY_DAYS_MS,
        }),
      );

      const sampleSize = Math.max(cardCount * 2, 10);
      const selected = useMultiType
        ? weightedSample(allChunks, chunkUsageMap, docCreatedAtMap, sampleSize, now)
        : shuffle(allChunks).slice(0, sampleSize);
      evt.set("selectedChunks", selected.length);

      const openai = getOpenAIClient();
      const model = "gpt-4o-mini";
      evt.set("model", model);

      if (!useMultiType) {
        return await generateLegacy(
          ctx,
          openai,
          model,
          selected,
          documents,
          user._id,
          cardCount,
          evt,
        );
      }

      const typeCoverageHint = buildTypeCoverageHint(chunkUsageMap);
      const systemPrompt = buildMultiTypePrompt(selected.length, cardCount) + typeCoverageHint;
      const userPrompt = selected
        .map((chunk, i) => `Chunk ${i} (from "${chunk.documentTitle}"):\n${chunk.content}`)
        .join("\n\n---\n\n");

      let validCards: { card: RawCard; chunks: ChunkInfo[] }[] = [];
      let generationAttempts = 0;
      const maxBatchRetries = 2;

      while (validCards.length < cardCount && generationAttempts <= maxBatchRetries) {
        generationAttempts++;
        const raw = await callWithRetry(
          openai,
          [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          model,
          evt,
        );

        let cards: RawCard[];
        try {
          const parsed = JSON.parse(raw);
          cards = Array.isArray(parsed) ? parsed : (parsed.cards ?? []);
        } catch {
          evt.set("parseError", raw.substring(0, 500));
          continue;
        }

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

        if (validated.length > 0 && dropped.length / cards.length <= 0.5) {
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

// Only valid after validateCard — assumes all type-specific fields are present.
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

async function generateLegacy(
  ctx: ActionCtx,
  openai: OpenAI,
  model: string,
  selected: ChunkInfo[],
  documents: { _id: Id<"documents">; title: string }[],
  userId: string,
  cardCount: number,
  evt: WideEvent,
): Promise<Id<"posts">[]> {
  const systemPrompt = buildLegacyPrompt(Math.min(selected.length, cardCount));
  const subset = selected.slice(0, cardCount);
  const userPrompt = subset
    .map((chunk, i) => `Chunk ${i + 1}:\n${chunk.content}`)
    .join("\n\n---\n\n");

  const raw = await callWithRetry(
    openai,
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    model,
    evt,
  );

  let posts: string[];
  try {
    const parsed = JSON.parse(raw);
    posts = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed.posts)
        ? parsed.posts
        : ((Object.values(parsed).find(Array.isArray) as string[]) ?? []);
  } catch {
    throw new Error("Failed to parse AI response");
  }

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
