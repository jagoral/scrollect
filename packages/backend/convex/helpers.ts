import { v } from "convex/values";

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
