import type { GenericCtx } from "@convex-dev/better-auth";
import { v } from "convex/values";

import type { DataModel, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, query } from "./_generated/server";
import { authComponent } from "./auth";

export const listByDocument = query({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    const user = await authComponent.safeGetAuthUser(ctx as unknown as GenericCtx<DataModel>);
    if (!user) {
      return [];
    }
    const doc = await ctx.db.get(args.documentId);
    if (!doc || doc.userId !== user._id) {
      return [];
    }
    return await ctx.db
      .query("chunks")
      .withIndex("by_documentId", (q) => q.eq("documentId", args.documentId))
      .collect();
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
