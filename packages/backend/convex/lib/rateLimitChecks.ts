import { v } from "convex/values";

import { internalMutation } from "../_generated/server";
import { resolveTier } from "../entitlements";
import { rateLimiter, tieredLimiterName } from "./rateLimitConfig";

export const enforceFeedGenerationLimit = internalMutation({
  args: { userId: v.string() },
  returns: v.union(
    v.object({ ok: v.literal(true), retryAfter: v.optional(v.number()) }),
    v.object({ ok: v.literal(false), retryAfter: v.number() }),
  ),
  handler: async (ctx, { userId }) => {
    const tier = await resolveTier(ctx, userId);
    const name = tieredLimiterName("feedGeneration", tier);
    const { ok, retryAfter } = await rateLimiter.limit(ctx, name, { key: userId });
    if (ok) return { ok, retryAfter };
    return { ok, retryAfter: retryAfter! };
  },
});
