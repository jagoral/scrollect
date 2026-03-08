import type { GenericCtx } from "@convex-dev/better-auth";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";

import type { DataModel } from "./_generated/dataModel";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { authComponent } from "./auth";

export const list = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const user = await authComponent.safeGetAuthUser(ctx as unknown as GenericCtx<DataModel>);
    if (!user) {
      return {
        page: [],
        isDone: true,
        continueCursor: "",
      };
    }

    const result = await ctx.db
      .query("posts")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .order("desc")
      .paginate(args.paginationOpts);

    const enrichedPage = await Promise.all(
      result.page.map(async (post) => {
        const doc = await ctx.db.get(post.sourceDocumentId);
        const bookmark = await ctx.db
          .query("bookmarks")
          .withIndex("by_userId_post", (q) => q.eq("userId", user._id).eq("postId", post._id))
          .first();
        return {
          ...post,
          sourceDocumentTitle: doc?.title ?? null,
          isBookmarked: bookmark !== null,
        };
      }),
    );

    return { ...result, page: enrichedPage };
  },
});

export const setReaction = mutation({
  args: {
    postId: v.id("posts"),
    reaction: v.union(v.literal("like"), v.literal("dislike"), v.literal("none")),
  },
  handler: async (ctx, args) => {
    const user = await authComponent.safeGetAuthUser(ctx as unknown as GenericCtx<DataModel>);
    if (!user) throw new Error("Not authenticated");

    const post = await ctx.db.get(args.postId);
    if (!post || post.userId !== user._id) {
      throw new Error("Post not found");
    }

    if (args.reaction === "none") {
      await ctx.db.patch(args.postId, { reaction: undefined });
      return null;
    }

    await ctx.db.patch(args.postId, { reaction: args.reaction });
    return args.reaction;
  },
});

export const getLastGeneratedAt = query({
  args: {},
  handler: async (ctx) => {
    const user = await authComponent.safeGetAuthUser(ctx as unknown as GenericCtx<DataModel>);
    if (!user) return null;

    const newest = await ctx.db
      .query("posts")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .order("desc")
      .first();

    return newest?.createdAt ?? null;
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
