import { v } from "convex/values";

import { internal } from "./_generated/api";
import { internalMutation, internalQuery } from "./_generated/server";

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

export const scheduleDatalabPoll = internalMutation({
  args: {
    documentId: v.id("documents"),
    checkUrl: v.string(),
    attempt: v.number(),
    delayMs: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.scheduler.runAfter(args.delayMs, internal.parsing.pollDatalabResult, {
      documentId: args.documentId,
      checkUrl: args.checkUrl,
      attempt: args.attempt,
    });
  },
});

export const scheduleEmbedChunks = internalMutation({
  args: {
    documentId: v.id("documents"),
    chunkIds: v.array(v.id("chunks")),
    chunkCount: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.scheduler.runAfter(0, internal.parsing.embedAndFinalize, {
      documentId: args.documentId,
      chunkIds: args.chunkIds,
      chunkCount: args.chunkCount,
    });
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
