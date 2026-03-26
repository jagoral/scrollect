import { paginationOptsValidator } from "convex/server";
import type { GenericMutationCtx } from "convex/server";
import { v } from "convex/values";

import type { DataModel } from "../_generated/dataModel";
import type { Id } from "../_generated/dataModel";
import { internalQuery, mutation, query } from "../_generated/server";
import { requireAuth, optionalAuth } from "../lib/functions";
import { dislikeReason, reactionInput } from "../lib/validators";
import type { DislikeReason } from "../lib/validators";
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
    dislikeReason: v.optional(dislikeReason),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    const post = await ctx.db.get(args.postId);
    if (!post || post.userId !== user._id) {
      throw new Error("Post not found");
    }

    if (args.reaction === "dislike" && !args.dislikeReason) {
      throw new Error("dislikeReason is required when reaction is dislike");
    }
    if (args.reaction !== "dislike" && args.dislikeReason) {
      throw new Error("dislikeReason must not be set when reaction is not dislike");
    }

    // Un-reacting removes the feedback row and clears the post reaction, but does
    // NOT un-reject a low_quality draft. Draft rejection is intentionally one-way:
    // once a user marks a card as low quality, we never resurface it - even if
    // they later clear their reaction. This prevents noisy cards from re-entering
    // the scoring pool.
    if (args.reaction === "none") {
      await ctx.db.patch(args.postId, { reaction: undefined });
      if (post.cardDraftId) {
        await deleteReactionFeedback(ctx, user._id, post.cardDraftId);
      }
      return null;
    }

    await ctx.db.patch(args.postId, { reaction: args.reaction });

    if (post.cardDraftId) {
      await upsertReactionFeedback(ctx, {
        userId: user._id,
        postId: args.postId,
        cardDraftId: post.cardDraftId,
        reaction: args.reaction as "like" | "dislike",
        dislikeReason: args.dislikeReason,
      });

      if (args.dislikeReason === "low_quality") {
        const draft = await ctx.db.get(post.cardDraftId);
        if (draft && draft.status !== "rejected") {
          await ctx.db.patch(post.cardDraftId, {
            status: "rejected",
            rejectionReason: "low_quality_user_feedback",
          });
        }
      }
    }

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

type MutationCtx = GenericMutationCtx<DataModel>;

async function upsertReactionFeedback(
  ctx: MutationCtx,
  params: {
    userId: string;
    postId: Id<"posts">;
    cardDraftId: Id<"cardDrafts">;
    reaction: "like" | "dislike";
    dislikeReason: DislikeReason | undefined;
  },
): Promise<void> {
  const existing = await ctx.db
    .query("reactionFeedback")
    .withIndex("by_userId_cardDraftId", (q) =>
      q.eq("userId", params.userId).eq("cardDraftId", params.cardDraftId),
    )
    .first();

  if (existing) {
    await ctx.db.patch(existing._id, {
      reaction: params.reaction,
      dislikeReason: params.dislikeReason,
      postId: params.postId,
    });
  } else {
    await ctx.db.insert("reactionFeedback", {
      userId: params.userId,
      postId: params.postId,
      cardDraftId: params.cardDraftId,
      reaction: params.reaction,
      dislikeReason: params.dislikeReason,
      createdAt: Date.now(),
    });
  }
}

async function deleteReactionFeedback(
  ctx: MutationCtx,
  userId: string,
  cardDraftId: Id<"cardDrafts">,
): Promise<void> {
  const existing = await ctx.db
    .query("reactionFeedback")
    .withIndex("by_userId_cardDraftId", (q) =>
      q.eq("userId", userId).eq("cardDraftId", cardDraftId),
    )
    .first();

  if (existing) {
    await ctx.db.delete(existing._id);
  }
}
