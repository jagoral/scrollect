import { ConvexError, v } from "convex/values";

import { mutation } from "../_generated/server";
import { requireAuth } from "../lib/functions";
import { allFeedScope, documentFeedScope, topicFeedScope } from "../../src/feed/logic/servingScope";
import type { ServingResult } from "./serving/orchestrator";
import { serveFeedForScope } from "./serving/orchestrator";

export const serveFeed = mutation({
  args: {},
  returns: v.object({
    posts: v.array(v.id("posts")),
    reason: v.optional(v.union(v.literal("no_drafts"), v.literal("processing"))),
  }),
  handler: async (ctx, _args): Promise<ServingResult> => {
    return await serveFeedForScope(ctx, { scope: allFeedScope() });
  },
});

export const serveDocumentFeed = mutation({
  args: {
    documentId: v.id("documents"),
  },
  returns: v.object({
    posts: v.array(v.id("posts")),
    reason: v.optional(v.union(v.literal("no_drafts"), v.literal("processing"))),
  }),
  handler: async (ctx, args): Promise<ServingResult> => {
    return await serveFeedForScope(ctx, {
      scope: documentFeedScope(args.documentId),
    });
  },
});

export const serveTopicFeed = mutation({
  args: {
    topicId: v.id("topics"),
  },
  returns: v.object({
    posts: v.array(v.id("posts")),
    reason: v.optional(v.union(v.literal("no_drafts"), v.literal("processing"))),
  }),
  handler: async (ctx, args): Promise<ServingResult> => {
    const user = await requireAuth(ctx);
    const topic = await ctx.db.get(args.topicId);
    if (!topic || topic.userId !== user._id) {
      throw new ConvexError({ code: "topic_not_found" as const });
    }

    const assignments = await ctx.db
      .query("documentTopics")
      .withIndex("by_topicId", (q) => q.eq("topicId", args.topicId))
      .collect();

    const documentIds = assignments
      .filter((a) => a.userId === user._id)
      .map((a) => a.documentId as string);

    if (documentIds.length === 0) {
      return { posts: [], reason: "no_drafts" };
    }

    return await serveFeedForScope(ctx, {
      scope: topicFeedScope(args.topicId, documentIds),
    });
  },
});
