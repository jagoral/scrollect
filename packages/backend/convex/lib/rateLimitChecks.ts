import { v } from "convex/values";

import { internalMutation } from "../_generated/server";
import { rateLimiter } from "./rateLimitConfig";

export const checkFeedGenerationLimit = internalMutation({
  args: { userId: v.string() },
  returns: v.object({
    ok: v.boolean(),
    retryAfter: v.optional(v.number()),
  }),
  handler: async (ctx, { userId }) => {
    const { ok, retryAfter } = await rateLimiter.limit(ctx, "feedGeneration", { key: userId });
    return { ok, retryAfter };
  },
});
