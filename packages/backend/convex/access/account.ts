import { v } from "convex/values";
import type { GenericMutationCtx } from "convex/server";

import type { DataModel } from "../_generated/dataModel";
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

export type DeleteRemainingUserDataResult = {
  deletedBookmarks: number;
  deletedBookmarkLists: number;
  deletedTags: number;
  deletedReactionFeedback: number;
  deletedEntitlementGrants: number;
  deletedTopics: number;
  deletedDocumentTopics: number;
  deletedPushTokens: number;
};

/**
 * Cascade-cleans every user-owned row that survives the per-document deletion pass.
 * Exported so unit tests can exercise it with a stub `ctx.db` without going through
 * the Convex internalMutation harness; the public surface is the mutation below.
 */
export async function deleteRemainingUserDataLogic(
  ctx: GenericMutationCtx<DataModel>,
  args: { userId: string },
): Promise<DeleteRemainingUserDataResult> {
  const [
    bookmarks,
    bookmarkLists,
    tags,
    reactionFeedback,
    grants,
    topics,
    documentTopics,
    pushTokens,
  ] = await Promise.all([
    ctx.db
      .query("bookmarks")
      .withIndex("by_userId_post", (q) => q.eq("userId", args.userId))
      .collect(),
    ctx.db
      .query("bookmarkLists")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect(),
    ctx.db
      .query("tags")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect(),
    ctx.db
      .query("reactionFeedback")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect(),
    ctx.db
      .query("entitlementGrants")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect(),
    ctx.db
      .query("topics")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect(),
    ctx.db
      .query("documentTopics")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect(),
    ctx.db
      .query("pushTokens")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect(),
  ]);

  await Promise.all([
    ...bookmarks.map((doc) => ctx.db.delete(doc._id)),
    ...bookmarkLists.map((doc) => ctx.db.delete(doc._id)),
    ...tags.map((doc) => ctx.db.delete(doc._id)),
    ...reactionFeedback.map((doc) => ctx.db.delete(doc._id)),
    ...grants.map((doc) => ctx.db.delete(doc._id)),
    ...topics.map((doc) => ctx.db.delete(doc._id)),
    ...documentTopics.map((doc) => ctx.db.delete(doc._id)),
    ...pushTokens.map((doc) => ctx.db.delete(doc._id)),
  ]);

  return {
    deletedBookmarks: bookmarks.length,
    deletedBookmarkLists: bookmarkLists.length,
    deletedTags: tags.length,
    deletedReactionFeedback: reactionFeedback.length,
    deletedEntitlementGrants: grants.length,
    deletedTopics: topics.length,
    deletedDocumentTopics: documentTopics.length,
    deletedPushTokens: pushTokens.length,
  };
}

export const deleteRemainingUserData = internalMutation({
  args: { userId: v.string() },
  returns: v.object({
    deletedBookmarks: v.number(),
    deletedBookmarkLists: v.number(),
    deletedTags: v.number(),
    deletedReactionFeedback: v.number(),
    deletedEntitlementGrants: v.number(),
    deletedTopics: v.number(),
    deletedDocumentTopics: v.number(),
    deletedPushTokens: v.number(),
  }),
  handler: async (ctx, args) => deleteRemainingUserDataLogic(ctx, args),
});
