import { RateLimiter, HOUR } from "@convex-dev/rate-limiter";

import { components } from "../_generated/api";

/**
 * Centralized rate limit configuration.
 *
 * Tier-aware rates: each endpoint has a `free` variant (base rate) and a `_pro`
 * variant (tier factor applied). Callers resolve the user's tier and pick the
 * matching name — see `tieredLimiterName`.
 */
export const rateLimiter = new RateLimiter(components.rateLimiter, {
  documentUpload: { kind: "fixed window", rate: 10, period: HOUR },
  documentUpload_pro: { kind: "fixed window", rate: 30, period: HOUR },
  uploadUrlGeneration: { kind: "fixed window", rate: 20, period: HOUR },
  uploadUrlGeneration_pro: { kind: "fixed window", rate: 60, period: HOUR },
  feedGeneration: { kind: "fixed window", rate: 5, period: HOUR },
  feedGeneration_pro: { kind: "fixed window", rate: 15, period: HOUR },
});

export type TieredLimiterBase = "documentUpload" | "uploadUrlGeneration" | "feedGeneration";

export function tieredLimiterName(base: TieredLimiterBase, tier: "free" | "pro") {
  return tier === "pro" ? (`${base}_pro` as const) : base;
}
