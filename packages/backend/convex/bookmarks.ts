import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { requireAuth, optionalAuth } from "./lib/functions";

export const toggle = mutation({
  args: { postId: v.id("posts") },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    const post = await ctx.db.get(args.postId);
    if (!post || post.userId !== user._id) {
      throw new Error("Post not found");
    }

    // Get or create default bookmark list
    let defaultList = await ctx.db
      .query("bookmarkLists")
      .withIndex("by_userId_default", (q) => q.eq("userId", user._id).eq("isDefault", true))
      .first();

    if (!defaultList) {
      const listId = await ctx.db.insert("bookmarkLists", {
        userId: user._id,
        name: "Saved",
        isDefault: true,
        createdAt: Date.now(),
      });
      defaultList = (await ctx.db.get(listId))!;
    }

    // Check if bookmark exists
    const existing = await ctx.db
      .query("bookmarks")
      .withIndex("by_userId_post", (q) => q.eq("userId", user._id).eq("postId", args.postId))
      .first();

    if (existing) {
      await ctx.db.delete(existing._id);
      return { bookmarked: false };
    }

    await ctx.db.insert("bookmarks", {
      userId: user._id,
      postId: args.postId,
      listId: defaultList._id,
      createdAt: Date.now(),
    });
    return { bookmarked: true };
  },
});

export const listSaved = query({
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

    const defaultList = await ctx.db
      .query("bookmarkLists")
      .withIndex("by_userId_default", (q) => q.eq("userId", user._id).eq("isDefault", true))
      .first();

    if (!defaultList) {
      return {
        page: [],
        isDone: true,
        continueCursor: "",
      };
    }

    const result = await ctx.db
      .query("bookmarks")
      .withIndex("by_list", (q) => q.eq("listId", defaultList._id))
      .order("desc")
      .paginate(args.paginationOpts);

    const uniquePostIds = [...new Set(result.page.map((b) => b.postId))];
    // Promise.all preserves input order — positional index maps results to IDs
    const posts = await Promise.all(uniquePostIds.map((id) => ctx.db.get(id)));
    const postMap = new Map(uniquePostIds.map((id, i) => [id, posts[i]]));

    const uniqueChunkIds = [
      ...new Set(posts.filter(Boolean).map((p) => p!.primarySourceChunkId)),
    ];
    const chunks = await Promise.all(uniqueChunkIds.map((id) => ctx.db.get(id)));
    const chunkMap = new Map(uniqueChunkIds.map((id, i) => [id, chunks[i]]));

    const enrichedPage = result.page.map((bookmark) => {
      const post = postMap.get(bookmark.postId);
      if (!post) {
        return { ...bookmark, post: null };
      }
      const chunk = chunkMap.get(post.primarySourceChunkId);
      return {
        ...bookmark,
        post: {
          ...post,
          sourceDocumentTitle: post.primarySourceDocumentTitle,
          sourceChunkId: post.primarySourceChunkId,
          sectionTitle: post.primarySourceSectionTitle ?? null,
          pageNumber: post.primarySourcePageNumber ?? null,
          chunkIndex: chunk?.chunkIndex ?? 0,
        },
      };
    });

    return { ...result, page: enrichedPage };
  },
});
