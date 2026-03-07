import type { GenericCtx } from "@convex-dev/better-auth";
import { v } from "convex/values";

import type { DataModel } from "./_generated/dataModel";
import { internalMutation, internalQuery, query } from "./_generated/server";
import { authComponent } from "./auth";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await authComponent.safeGetAuthUser(ctx as unknown as GenericCtx<DataModel>);
    if (!user) {
      return [];
    }
    return await ctx.db
      .query("posts")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .order("desc")
      .collect();
  },
});

export const listReadyDocuments = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const docs = await ctx.db
      .query("documents")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();
    return docs.filter((d) => d.status === "ready");
  },
});

export const listChunksForDocument = internalQuery({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("chunks")
      .withIndex("by_documentId", (q) => q.eq("documentId", args.documentId))
      .collect();
  },
});

export const createPost = internalMutation({
  args: {
    content: v.string(),
    sourceChunkId: v.id("chunks"),
    sourceDocumentId: v.id("documents"),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("posts", {
      content: args.content,
      sourceChunkId: args.sourceChunkId,
      sourceDocumentId: args.sourceDocumentId,
      userId: args.userId,
      createdAt: Date.now(),
    });
  },
});
