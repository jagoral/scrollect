import { ConvexError, v } from "convex/values";

import type { MutationCtx, QueryCtx } from "./_generated/server";

import { mutation, query } from "./_generated/server";
import { requireAuth, optionalAuth } from "./lib/functions";
import { polar } from "./polar";

export type Tier = "free" | "pro";

const FREE_DOCUMENT_LIMIT = 3;
const PRO_DOCUMENT_LIMIT = 30;

const tierValidator = v.union(v.literal("free"), v.literal("pro"));

const usageValidator = v.object({
  tier: tierValidator,
  used: v.number(),
  limit: v.number(),
  periodStart: v.union(v.number(), v.null()),
  periodEnd: v.union(v.number(), v.null()),
});

export async function resolveTier(ctx: QueryCtx, userId: string): Promise<Tier> {
  const subscription = await polar.getCurrentSubscription(ctx, { userId });
  if (!subscription) return "free";
  if (subscription.productKey !== "pro") return "free";
  if (subscription.status !== "active" && subscription.status !== "trialing") return "free";
  return "pro";
}

export async function computeDocumentUsage(
  ctx: QueryCtx,
  userId: string,
): Promise<{
  tier: Tier;
  used: number;
  limit: number;
  periodStart: number | null;
  periodEnd: number | null;
}> {
  const subscription = await polar.getCurrentSubscription(ctx, { userId });
  const tier: Tier =
    subscription &&
    subscription.productKey === "pro" &&
    (subscription.status === "active" || subscription.status === "trialing")
      ? "pro"
      : "free";

  if (tier === "free") {
    // Bound the read by limit + 1: we only need to know if usage has reached/exceeded limit.
    const docs = await ctx.db
      .query("documents")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .take(FREE_DOCUMENT_LIMIT + 1);
    return {
      tier,
      used: docs.length,
      limit: FREE_DOCUMENT_LIMIT,
      periodStart: null,
      periodEnd: null,
    };
  }

  const periodStart = new Date(subscription!.currentPeriodStart).getTime();
  const periodEnd = subscription!.currentPeriodEnd
    ? new Date(subscription!.currentPeriodEnd).getTime()
    : null;

  const docs = await ctx.db
    .query("documents")
    .withIndex("by_userId_createdAt", (q) => q.eq("userId", userId).gte("createdAt", periodStart))
    .take(PRO_DOCUMENT_LIMIT + 1);

  return {
    tier,
    used: docs.length,
    limit: PRO_DOCUMENT_LIMIT,
    periodStart,
    periodEnd,
  };
}

// Best-effort check: two concurrent uploads at used = limit - 1 can both pass.
// The rate limiter backstops bursts and the absolute cost of one extra document
// is small, so we accept the race here rather than serialize per-user uploads.
export async function enforceDocumentLimit(ctx: MutationCtx, userId: string) {
  const usage = await computeDocumentUsage(ctx, userId);
  if (usage.used >= usage.limit) {
    throw new ConvexError({
      kind: "DocumentLimitReached" as const,
      tier: usage.tier,
      used: usage.used,
      limit: usage.limit,
      resetsAt: usage.periodEnd,
    });
  }
  return usage.tier;
}

export const getUserTier = query({
  args: {},
  returns: tierValidator,
  handler: async (ctx) => {
    const user = await optionalAuth(ctx);
    if (!user) return "free";
    return await resolveTier(ctx, user._id);
  },
});

export const getDocumentUsage = query({
  args: {},
  returns: v.union(usageValidator, v.null()),
  handler: async (ctx) => {
    const user = await optionalAuth(ctx);
    if (!user) return null;
    return await computeDocumentUsage(ctx, user._id);
  },
});

export const getUserProfile = query({
  args: {},
  returns: v.union(
    v.object({
      onboardingCompleted: v.boolean(),
    }),
    v.null(),
  ),
  handler: async (ctx) => {
    const user = await optionalAuth(ctx);
    if (!user) return null;
    const profile = await ctx.db
      .query("userProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();
    return { onboardingCompleted: profile?.onboardingCompleted ?? false };
  },
});

export const markOnboardingCompleted = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const user = await requireAuth(ctx);
    const profile = await ctx.db
      .query("userProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();
    if (profile) {
      if (!profile.onboardingCompleted) {
        await ctx.db.patch(profile._id, { onboardingCompleted: true });
      }
    } else {
      await ctx.db.insert("userProfiles", {
        userId: user._id,
        onboardingCompleted: true,
        createdAt: Date.now(),
      });
    }
    return null;
  },
});
