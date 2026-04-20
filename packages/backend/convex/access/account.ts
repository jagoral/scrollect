import { v } from "convex/values";

import { internalMutation, internalQuery } from "../_generated/server";

export const getUserDocumentIds = internalQuery({
  args: { userId: v.string() },
  returns: v.array(v.id("documents")),
  handler: async (ctx, args) => {
    const docs = await ctx.db
      .query("documents")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();
    return docs.map((d) => d._id);
  },
});

export const deleteRemainingUserData = internalMutation({
  args: { userId: v.string() },
  returns: v.object({
    deletedBookmarks: v.number(),
    deletedBookmarkLists: v.number(),
    deletedTags: v.number(),
    deletedReactionFeedback: v.number(),
    deletedEntitlementGrants: v.number(),
  }),
  handler: async (ctx, args) => {
    const bookmarks = await ctx.db
      .query("bookmarks")
      .withIndex("by_userId_post", (q) => q.eq("userId", args.userId))
      .collect();
    for (const bookmark of bookmarks) {
      await ctx.db.delete(bookmark._id);
    }

    const bookmarkLists = await ctx.db
      .query("bookmarkLists")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();
    for (const list of bookmarkLists) {
      await ctx.db.delete(list._id);
    }

    const tags = await ctx.db
      .query("tags")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();
    for (const tag of tags) {
      await ctx.db.delete(tag._id);
    }

    const reactionFeedback = await ctx.db
      .query("reactionFeedback")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();
    for (const fb of reactionFeedback) {
      await ctx.db.delete(fb._id);
    }

    const grants = await ctx.db
      .query("entitlementGrants")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();
    for (const grant of grants) {
      await ctx.db.delete(grant._id);
    }

    return {
      deletedBookmarks: bookmarks.length,
      deletedBookmarkLists: bookmarkLists.length,
      deletedTags: tags.length,
      deletedReactionFeedback: reactionFeedback.length,
      deletedEntitlementGrants: grants.length,
    };
  },
});
