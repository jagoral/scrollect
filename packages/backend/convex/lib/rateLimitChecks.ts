import { v } from "convex/values";

import { internalMutation } from "../_generated/server";
import { rateLimiter } from "./rateLimitConfig";

export const enforceFeedGenerationLimit = internalMutation({
  args: { userId: v.string() },
  returns: v.union(
    v.object({ ok: v.literal(true), retryAfter: v.optional(v.number()) }),
    v.object({ ok: v.literal(false), retryAfter: v.number() }),
  ),
  handler: async (ctx, { userId }) => {
    const { ok, retryAfter } = await rateLimiter.limit(ctx, "feedGeneration", { key: userId });
    if (ok) return { ok, retryAfter };
    return { ok, retryAfter: retryAfter! };
  },
});
