import { RateLimiter, HOUR, DAY } from "@convex-dev/rate-limiter";

import { components } from "../_generated/api";

/**
 * Centralized rate limit configuration.
 *
 * Tier-aware rates: each endpoint has a `free` variant (base rate) and a `_pro`
 * variant (tier factor applied). Callers resolve the user's tier and pick the
 * matching name — see `tieredLimiterName`.
 *
 * Document upload / URL generation rates are intentionally loose for free users:
 * the real volume cap is `enforceDocumentLimit` (3 documents lifetime). These
 * rates exist only as burst / retry protection.
 *
 * Feed generation rates must match the advertised values on the pricing page
 * (landing/pricing-section.tsx).
 */
export const rateLimiter = new RateLimiter(components.rateLimiter, {
  documentUpload: { kind: "fixed window", rate: 10, period: HOUR },
  documentUpload_pro: { kind: "fixed window", rate: 30, period: HOUR },
  uploadUrlGeneration: { kind: "fixed window", rate: 20, period: HOUR },
  uploadUrlGeneration_pro: { kind: "fixed window", rate: 60, period: HOUR },
  feedGeneration: { kind: "fixed window", rate: 3, period: HOUR },
  feedGeneration_pro: { kind: "fixed window", rate: 15, period: HOUR },
  topicCreate: { kind: "fixed window", rate: 20, period: HOUR },
  topicCreate_pro: { kind: "fixed window", rate: 60, period: HOUR },
  topicEmbed: { kind: "fixed window", rate: 30, period: HOUR },
  topicEmbed_pro: { kind: "fixed window", rate: 100, period: HOUR },
  // M5 push notifications: at most one draft-pool refill push per user per 24h,
  // regardless of how many replenishment events fire. Not tier-aware - every user
  // has the same anti-spam budget.
  pushDraftPool: { kind: "fixed window", rate: 1, period: DAY },
});

export type TieredLimiterBase =
  | "documentUpload"
  | "uploadUrlGeneration"
  | "feedGeneration"
  | "topicCreate"
  | "topicEmbed";

export function tieredLimiterName(base: TieredLimiterBase, tier: "free" | "pro") {
  return tier === "pro" ? (`${base}_pro` as const) : base;
}
