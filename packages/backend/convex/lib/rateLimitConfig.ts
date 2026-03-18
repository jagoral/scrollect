import { RateLimiter, HOUR } from "@convex-dev/rate-limiter";

import { components } from "../_generated/api";

/**
 * Centralized rate limit configuration.
 *
 * To add a new rate-limited endpoint:
 * 1. Add a new entry below with the endpoint name, kind, rate, and period
 * 2. Call `rateLimiter.limit(ctx, "endpointName", { key: userId })` in the mutation handler
 * 3. If the handler is an action, create an internal mutation wrapper in `rateLimitChecks.ts`
 *    and call it via `ctx.runMutation`
 * 4. When subscription tiers are added, multiply `rate` by a tier factor
 */
export const rateLimiter = new RateLimiter(components.rateLimiter, {
  documentUpload: { kind: "fixed window", rate: 10, period: HOUR },
  uploadUrlGeneration: { kind: "fixed window", rate: 20, period: HOUR },
  feedGeneration: { kind: "fixed window", rate: 5, period: HOUR },
});
