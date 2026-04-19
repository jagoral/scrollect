import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";

import { mutation, query } from "../_generated/server";
import { requireAuth, optionalAuth } from "../lib/functions";
import { postType, reactionType, typeData } from "../lib/validators";

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

const bookmarkedPostCard = v.object({
  _id: v.id("posts"),
  _creationTime: v.number(),
  content: v.string(),
  postType,
  typeData,
  primarySourceDocumentId: v.id("documents"),
  primarySourceDocumentTitle: v.string(),
  postDraftId: v.optional(v.id("postDrafts")),
  sectionTitle: v.union(v.string(), v.null()),
  pageStart: v.union(v.number(), v.null()),
  pageEnd: v.union(v.number(), v.null()),
  fileType: v.optional(v.string()),
  createdAt: v.number(),
  reaction: v.optional(reactionType),
  isBookmarked: v.literal(true),
});

export const listBookmarkedByDocument = query({
  args: { documentId: v.id("documents") },
  returns: v.array(bookmarkedPostCard),
  handler: async (ctx, args) => {
    const user = await optionalAuth(ctx);
    if (!user) return [];

    const posts = await ctx.db
      .query("posts")
      .withIndex("by_userId_document", (q) =>
        q.eq("userId", user._id).eq("primarySourceDocumentId", args.documentId),
      )
      .order("desc")
      .take(200);

    const bookmarks = await Promise.all(
      posts.map((post) =>
        ctx.db
          .query("bookmarks")
          .withIndex("by_userId_post", (q) => q.eq("userId", user._id).eq("postId", post._id))
          .first(),
      ),
    );

    return posts
      .filter((_, i) => bookmarks[i] != null)
      .map((post) => ({
        _id: post._id,
        _creationTime: post._creationTime,
        content: post.content,
        postType: post.postType,
        typeData: post.typeData,
        primarySourceDocumentId: post.primarySourceDocumentId,
        primarySourceDocumentTitle: post.primarySourceDocumentTitle,
        postDraftId: post.postDraftId,
        sectionTitle: post.sectionTitle ?? null,
        pageStart: post.pageStart ?? null,
        pageEnd: post.pageEnd ?? null,
        fileType: post.fileType,
        createdAt: post.createdAt,
        reaction: post.reaction,
        isBookmarked: true as const,
      }));
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

    const enrichedPage = result.page.map((bookmark) => {
      const post = postMap.get(bookmark.postId);
      if (!post) {
        return { ...bookmark, post: null };
      }
      return {
        ...bookmark,
        post: {
          ...post,
          sourceDocumentTitle: post.primarySourceDocumentTitle,
          sectionTitle: post.sectionTitle ?? null,
          pageStart: post.pageStart ?? null,
          pageEnd: post.pageEnd ?? null,
          fileType: post.fileType,
        },
      };
    });

    return { ...result, page: enrichedPage };
  },
});
