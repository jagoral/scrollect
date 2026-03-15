import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";

import { internalMutation, internalQuery, mutation, query } from "../_generated/server";
import { requireAuth, optionalAuth } from "../lib/functions";
import { postType, reactionInput, typeData } from "../lib/validators";

export const list = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const user = await optionalAuth(ctx);
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
        const bookmark = await ctx.db
          .query("bookmarks")
          .withIndex("by_userId_post", (q) => q.eq("userId", user._id).eq("postId", post._id))
          .first();
        const chunk = await ctx.db.get(post.primarySourceChunkId);
        return {
          ...post,
          sourceDocumentTitle: post.primarySourceDocumentTitle,
          isBookmarked: bookmark !== null,
          sourceChunkId: post.primarySourceChunkId,
          sectionTitle: post.primarySourceSectionTitle ?? null,
          pageNumber: post.primarySourcePageNumber ?? null,
          chunkIndex: chunk?.chunkIndex ?? 0,
        };
      }),
    );

    return { ...result, page: enrichedPage };
  },
});

export const setReaction = mutation({
  args: {
    postId: v.id("posts"),
    reaction: reactionInput,
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

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

export const listSourcesByPostId = query({
  args: { postId: v.id("posts") },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    const post = await ctx.db.get(args.postId);
    if (!post || post.userId !== user._id) {
      throw new Error("Post not found");
    }

    const sources = await ctx.db
      .query("postSources")
      .withIndex("by_postId", (q) => q.eq("postId", args.postId))
      .collect();

    return await Promise.all(
      sources.map(async (source) => {
        const chunk = await ctx.db.get(source.chunkId);
        const doc = await ctx.db.get(source.documentId);
        return {
          _id: source._id,
          chunkId: source.chunkId,
          documentId: source.documentId,
          documentTitle: doc?.title ?? null,
          chunkContent: chunk?.content ?? null,
          chunkIndex: chunk?.chunkIndex ?? 0,
          sectionTitle: chunk?.sectionTitle ?? null,
          pageNumber: chunk?.pageNumber ?? null,
        };
      }),
    );
  },
});

export const getLastGeneratedAt = query({
  args: {},
  handler: async (ctx) => {
    const user = await optionalAuth(ctx);
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
    return await ctx.db
      .query("documents")
      .withIndex("by_userId_status", (q) => q.eq("userId", args.userId).eq("status", "ready"))
      .collect();
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

export const listSectionSummaries = internalQuery({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("sectionSummaries")
      .withIndex("by_documentId", (q) => q.eq("documentId", args.documentId))
      .collect();
  },
});

export const listRecentPostSources = internalQuery({
  args: { userId: v.string(), sinceTs: v.number() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("postSources")
      .withIndex("by_userId_createdAt", (q) =>
        q.eq("userId", args.userId).gte("createdAt", args.sinceTs),
      )
      .collect();
  },
});

export const listRecentPosts = internalQuery({
  args: { userId: v.string(), sinceTs: v.number() },
  handler: async (ctx, args) => {
    const posts = await ctx.db
      .query("posts")
      .withIndex("by_userId_createdAt", (q) =>
        q.eq("userId", args.userId).gte("createdAt", args.sinceTs),
      )
      .collect();
    return posts.map((p) => ({ _id: p._id, postType: p.postType }));
  },
});

export const listRecentChunkHashes = internalQuery({
  args: { userId: v.string(), sinceTs: v.number() },
  handler: async (ctx, args) => {
    const posts = await ctx.db
      .query("posts")
      .withIndex("by_userId_createdAt", (q) =>
        q.eq("userId", args.userId).gte("createdAt", args.sinceTs),
      )
      .collect();
    return posts.map((p) => p.sourceChunkHash);
  },
});

export const insertPost = internalMutation({
  args: {
    content: v.string(),
    postType,
    typeData,
    primarySourceDocumentId: v.id("documents"),
    primarySourceDocumentTitle: v.string(),
    primarySourceChunkId: v.id("chunks"),
    primarySourceSectionTitle: v.optional(v.string()),
    primarySourcePageNumber: v.optional(v.number()),
    sourceChunkIds: v.array(v.id("chunks")),
    sourceDocumentIds: v.array(v.id("documents")),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    if (args.postType !== args.typeData.type) {
      throw new Error(
        `postType "${args.postType}" does not match typeData.type "${args.typeData.type}"`,
      );
    }

    if (args.sourceChunkIds.length !== args.sourceDocumentIds.length) {
      throw new Error(
        `sourceChunkIds length (${args.sourceChunkIds.length}) must match sourceDocumentIds length (${args.sourceDocumentIds.length})`,
      );
    }

    if (args.sourceChunkIds.length === 0) {
      throw new Error("At least one source chunk is required");
    }

    const sourceChunkHash = [...args.sourceChunkIds].sort().join("+");

    const postId = await ctx.db.insert("posts", {
      content: args.content,
      postType: args.postType,
      typeData: args.typeData,
      primarySourceDocumentId: args.primarySourceDocumentId,
      primarySourceDocumentTitle: args.primarySourceDocumentTitle,
      primarySourceChunkId: args.primarySourceChunkId,
      primarySourceSectionTitle: args.primarySourceSectionTitle,
      primarySourcePageNumber: args.primarySourcePageNumber,
      sourceChunkHash,
      userId: args.userId,
      createdAt: now,
    });

    for (let i = 0; i < args.sourceChunkIds.length; i++) {
      await ctx.db.insert("postSources", {
        postId,
        chunkId: args.sourceChunkIds[i]!,
        documentId: args.sourceDocumentIds[i]!,
        userId: args.userId,
        createdAt: now,
      });
    }

    return postId;
  },
});
