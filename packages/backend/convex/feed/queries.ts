import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";

import { internalQuery, mutation, query } from "../_generated/server";
import { requireAuth, optionalAuth } from "../lib/functions";
import { reactionInput } from "../lib/validators";
import { FRESHNESS_WINDOW_MS } from "./logic/constants";

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

    // Date.now() is non-deterministic in Convex queries but acceptable here:
    // isNew will update on the next query re-evaluation triggered by any data write,
    // not at the exact 48-hour mark.
    const now = Date.now();

    const uniqueDocIds = [...new Set(result.page.map((p) => p.primarySourceDocumentId))];
    const docs = await Promise.all(uniqueDocIds.map((id) => ctx.db.get(id)));
    const docMap = new Map(uniqueDocIds.map((id, i) => [id, docs[i]]));

    const bookmarks = await Promise.all(
      result.page.map((post) =>
        ctx.db
          .query("bookmarks")
          .withIndex("by_userId_post", (q) => q.eq("userId", user._id).eq("postId", post._id))
          .first(),
      ),
    );

    const enrichedPage = result.page.map((post, i) => {
      const sourceDoc = docMap.get(post.primarySourceDocumentId);
      const isNew = sourceDoc ? now - sourceDoc.createdAt < FRESHNESS_WINDOW_MS : false;
      return {
        ...post,
        sourceDocumentTitle: post.primarySourceDocumentTitle,
        isBookmarked: bookmarks[i] != null,
        isNew,
        sectionTitle: post.sectionTitle ?? null,
        pageStart: post.pageStart ?? null,
        pageEnd: post.pageEnd ?? null,
        fileType: post.fileType,
      };
    });

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

export const listReadyDocuments = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("documents")
      .withIndex("by_userId_status", (q) => q.eq("userId", args.userId).eq("status", "ready"))
      .collect();
  },
});
