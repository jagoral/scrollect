import OpenAI from "openai";
import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { COLLECTION_NAME, ensureCollection, getQdrantClient } from "./qdrant";

function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY environment variable is required");
  }
  return new OpenAI({ apiKey });
}

async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const openai = getOpenAIClient();
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: texts,
  });
  return response.data.map((d) => d.embedding);
}

export const embedChunks = internalAction({
  args: {
    chunkIds: v.array(v.id("chunks")),
  },
  handler: async (ctx, args) => {
    await ensureCollection();
    const qdrant = getQdrantClient();

    // Fetch all chunks from Convex
    const chunks = await Promise.all(
      args.chunkIds.map(async (id) => {
        const chunk = await ctx.runQuery(internal.embeddings.getChunk, { id });
        return { id, chunk };
      }),
    );

    // Separate valid and missing chunks
    const validChunks: {
      id: Id<"chunks">;
      content: string;
      documentId: Id<"documents">;
      chunkIndex: number;
    }[] = [];

    for (const { id, chunk } of chunks) {
      if (chunk) {
        validChunks.push({
          id,
          content: chunk.content,
          documentId: chunk.documentId,
          chunkIndex: chunk.chunkIndex,
        });
      } else {
        await ctx.runMutation(internal.embeddings.updateChunkEmbedding, {
          id,
          embeddingStatus: "error",
        });
      }
    }

    if (validChunks.length === 0) return;

    // Batch generate embeddings (OpenAI supports up to 2048 per request)
    const BATCH_SIZE = 2048;
    for (let i = 0; i < validChunks.length; i += BATCH_SIZE) {
      const batch = validChunks.slice(i, i + BATCH_SIZE);
      const texts = batch.map((c) => c.content);

      try {
        const embeddings = await generateEmbeddings(texts);

        // Prepare Qdrant points
        const points = batch.map((chunk, idx) => ({
          id: crypto.randomUUID(),
          vector: embeddings[idx]!,
          payload: {
            chunkId: chunk.id as string,
            documentId: chunk.documentId as string,
            chunkIndex: chunk.chunkIndex,
          },
        }));

        // Upsert to Qdrant
        await qdrant.upsert(COLLECTION_NAME, { points });

        // Update each chunk in Convex
        await Promise.all(
          batch.map((chunk, idx) =>
            ctx.runMutation(internal.embeddings.updateChunkEmbedding, {
              id: chunk.id,
              embeddingStatus: "embedded",
              qdrantPointId: points[idx]!.id,
            }),
          ),
        );
      } catch {
        // Mark entire batch as error
        await Promise.all(
          batch.map((chunk) =>
            ctx.runMutation(internal.embeddings.updateChunkEmbedding, {
              id: chunk.id,
              embeddingStatus: "error",
            }),
          ),
        );
      }
    }
  },
});

export const searchSimilar = internalAction({
  args: {
    query: v.string(),
    userId: v.string(),
    topK: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await ensureCollection();
    const qdrant = getQdrantClient();
    const limit = args.topK ?? 10;

    const embeddings = await generateEmbeddings([args.query]);
    const queryEmbedding = embeddings[0]!;

    const results = await qdrant.search(COLLECTION_NAME, {
      vector: queryEmbedding,
      limit,
      with_payload: true,
    });

    // Filter by userId: fetch documents and check ownership
    const chunkResults: { chunkId: string; score: number }[] = [];

    for (const result of results) {
      const payload = result.payload as {
        chunkId: string;
        documentId: string;
        chunkIndex: number;
      };
      const doc = await ctx.runQuery(internal.embeddings.getDocument, {
        id: payload.documentId as Id<"documents">,
      });
      if (doc && doc.userId === args.userId) {
        chunkResults.push({
          chunkId: payload.chunkId,
          score: result.score,
        });
      }
    }

    return chunkResults;
  },
});

// Internal query/mutation helpers used by the actions above

export const getChunk = internalQuery({
  args: { id: v.id("chunks") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const getDocument = internalQuery({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const updateChunkEmbedding = internalMutation({
  args: {
    id: v.id("chunks"),
    embeddingStatus: v.union(v.literal("embedded"), v.literal("error")),
    qdrantPointId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const update: Record<string, unknown> = {
      embeddingStatus: args.embeddingStatus,
    };
    if (args.qdrantPointId !== undefined) {
      update.qdrantPointId = args.qdrantPointId;
    }
    await ctx.db.patch(args.id, update);
  },
});
