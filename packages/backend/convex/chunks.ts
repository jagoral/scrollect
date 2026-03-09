import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, query } from "./_generated/server";
import { optionalAuth } from "./lib/functions";

export const listByDocument = query({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    const user = await optionalAuth(ctx);
    if (!user) return [];
    const doc = await ctx.db.get(args.documentId);
    if (!doc || doc.userId !== user._id) return [];
    return await ctx.db
      .query("chunks")
      .withIndex("by_documentId", (q) => q.eq("documentId", args.documentId))
      .collect();
  },
});

export const getInternal = internalQuery({
  args: { id: v.id("chunks") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const createBatch = internalMutation({
  args: {
    documentId: v.id("documents"),
    chunks: v.array(
      v.object({
        content: v.string(),
        chunkIndex: v.number(),
        tokenCount: v.number(),
        sectionTitle: v.optional(v.string()),
        pageNumber: v.optional(v.number()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const ids: Id<"chunks">[] = [];
    for (const chunk of args.chunks) {
      const existing = await ctx.db
        .query("chunks")
        .withIndex("by_documentId_chunkIndex", (q) =>
          q.eq("documentId", args.documentId).eq("chunkIndex", chunk.chunkIndex),
        )
        .first();

      if (existing) {
        ids.push(existing._id);
        continue;
      }

      const id = await ctx.db.insert("chunks", {
        documentId: args.documentId,
        content: chunk.content,
        chunkIndex: chunk.chunkIndex,
        tokenCount: chunk.tokenCount,
        sectionTitle: chunk.sectionTitle,
        pageNumber: chunk.pageNumber,
        embedded: false,
        createdAt: now,
      });
      ids.push(id);
    }
    return ids;
  },
});

export const listByDocumentInternal = internalQuery({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("chunks")
      .withIndex("by_documentId", (q) => q.eq("documentId", args.documentId))
      .collect();
  },
});

export const getWithContext = query({
  args: { chunkId: v.id("chunks") },
  handler: async (ctx, args) => {
    const user = await optionalAuth(ctx);
    if (!user) return null;

    const chunk = await ctx.db.get(args.chunkId);
    if (!chunk) return null;

    // Verify the user owns the document this chunk belongs to
    const doc = await ctx.db.get(chunk.documentId);
    if (!doc || doc.userId !== user._id) return null;

    const previousChunk = await ctx.db
      .query("chunks")
      .withIndex("by_documentId_chunkIndex", (q) =>
        q.eq("documentId", chunk.documentId).eq("chunkIndex", chunk.chunkIndex - 1),
      )
      .first();

    const nextChunk = await ctx.db
      .query("chunks")
      .withIndex("by_documentId_chunkIndex", (q) =>
        q.eq("documentId", chunk.documentId).eq("chunkIndex", chunk.chunkIndex + 1),
      )
      .first();

    return {
      chunk,
      previousChunk: previousChunk ?? null,
      nextChunk: nextChunk ?? null,
    };
  },
});

export const listUnembedded = internalQuery({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("chunks")
      .withIndex("by_documentId_unembedded", (q) =>
        q.eq("documentId", args.documentId).eq("embedded", false),
      )
      .collect();
  },
});

export const markEmbedded = internalMutation({
  args: {
    chunkId: v.id("chunks"),
    embeddingId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.chunkId, {
      embedded: true,
      embeddingId: args.embeddingId,
    });
  },
});
