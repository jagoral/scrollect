import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { getCurrentUser } from "./auth";

export const getUserSubscription = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx, {});
    if (!user) return null;

    const sub = await ctx.db
      .query("subscriptions")
      .withIndex("by_userId", (q) => q.eq("userId", user.id))
      .first();

    return sub;
  },
});

export const getUserPageBudget = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx, {});
    if (!user) return null;

    let budget = await ctx.db
      .query("pageBudgets")
      .withIndex("by_userId", (q) => q.eq("userId", user.id))
      .first();

    // If no budget exists, assume free tier limits (3 docs, max 100 pages per doc)
    if (!budget) {
      return {
        isPro: false,
        pagesUsed: 0,
        monthlyLimit: 0,
        bonusPages: 0,
      };
    }

    const sub = await ctx.db
      .query("subscriptions")
      .withIndex("by_userId", (q) => q.eq("userId", user.id))
      .first();

    const isPro = sub?.status === "active";

    // Pro users get 2000 pages per month
    const monthlyLimit = isPro ? 2000 : 0;

    return {
      isPro,
      pagesUsed: budget.pagesUsed,
      monthlyLimit,
      bonusPages: budget.bonusPages,
      billingCycleStart: budget.billingCycleStart,
      billingCycleEnd: budget.billingCycleEnd,
    };
  },
});
