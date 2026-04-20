import { v } from "convex/values";

import { mutation } from "../_generated/server";
import { allFeedScope, documentFeedScope } from "../../src/feed/logic/servingScope";
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
