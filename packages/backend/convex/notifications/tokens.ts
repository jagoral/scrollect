import { v } from "convex/values";

import { internal } from "../_generated/api";
import { internalMutation, internalQuery, mutation } from "../_generated/server";
import { rateLimiter } from "../lib/rateLimitConfig";
import { requireAuth } from "../lib/functions";
import { WideEvent } from "../../src/platform/logging";

const STALE_TOKEN_CUTOFF_DAYS = 60;
const STALE_TOKEN_AGE_MS = STALE_TOKEN_CUTOFF_DAYS * 24 * 60 * 60 * 1000;
/**
 * Per-invocation cap so the stale-token cron never exceeds Convex's per-mutation
 * document budget. The cron self-reschedules until `hasMore === false`, so the cap
 * only bounds latency, not coverage.
 */
const STALE_TOKEN_CLEANUP_BATCH_SIZE = 500;

const platform = v.union(v.literal("ios"), v.literal("android"));

const pushTokenRow = v.object({
  _id: v.id("pushTokens"),
  token: v.string(),
});

export const upsertPushToken = mutation({
  args: { token: v.string(), platform },
  returns: v.null(),
  handler: async (ctx, args) => {
    const evt = new WideEvent("notifications.upsertPushToken");
    try {
      const user = await requireAuth(ctx);
      const now = Date.now();

      const existing = await ctx.db
        .query("pushTokens")
        .withIndex("by_token", (q) => q.eq("token", args.token))
        .first();

      if (existing) {
        // A token can migrate between users (e.g. sign out + sign in on the same
        // device). Reassign it instead of leaving the old user receiving pushes.
        const reassigned = existing.userId !== user._id;
        await ctx.db.patch(existing._id, {
          userId: user._id,
          platform: args.platform,
          lastSeenAt: now,
        });
        evt.set({ userId: user._id, action: reassigned ? "reassigned" : "refreshed" });
      } else {
        await ctx.db.insert("pushTokens", {
          userId: user._id,
          token: args.token,
          platform: args.platform,
          lastSeenAt: now,
          createdAt: now,
        });
        evt.set({ userId: user._id, action: "inserted" });
      }
    } catch (error) {
      evt.setError(error);
      throw error;
    } finally {
      evt.emit();
    }
    return null;
  },
});

export const removePushToken = mutation({
  args: { token: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const evt = new WideEvent("notifications.removePushToken");
    try {
      const user = await requireAuth(ctx);
      // Scope the lookup by user so an arbitrary-token caller can't probe the
      // tokens table for ownership information; this also makes the read O(1)
      // for the common one-device-per-user case.
      const userTokens = await ctx.db
        .query("pushTokens")
        .withIndex("by_userId", (q) => q.eq("userId", user._id))
        .collect();
      const match = userTokens.find((row) => row.token === args.token);
      if (match) {
        await ctx.db.delete(match._id);
        evt.set({ userId: user._id, deleted: true });
      } else {
        evt.set({ userId: user._id, deleted: false });
      }
    } catch (error) {
      evt.setError(error);
      throw error;
    } finally {
      evt.emit();
    }
    return null;
  },
});

export const listPushTokensForUser = internalQuery({
  args: { userId: v.string() },
  returns: v.array(pushTokenRow),
  handler: async (ctx, { userId }) => {
    const rows = await ctx.db
      .query("pushTokens")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();
    return rows.map((row) => ({ _id: row._id, token: row.token }));
  },
});

export const claimDraftPoolPushBudget = internalMutation({
  args: { userId: v.string() },
  returns: v.object({ ok: v.boolean(), retryAfter: v.optional(v.number()) }),
  handler: async (ctx, { userId }) => {
    const { ok, retryAfter } = await rateLimiter.limit(ctx, "pushDraftPool", { key: userId });
    return ok ? { ok: true } : { ok: false, retryAfter: retryAfter ?? 0 };
  },
});

/**
 * Reset the daily budget for a user. Called when a push send delivered nothing
 * (Expo unreachable, every token returned an error) so a single transport blip
 * doesn't burn the user's 24h budget.
 */
export const releaseDraftPoolPushBudget = internalMutation({
  args: { userId: v.string() },
  returns: v.null(),
  handler: async (ctx, { userId }) => {
    await rateLimiter.reset(ctx, "pushDraftPool", { key: userId });
    return null;
  },
});

export const deletePushTokensByIds = internalMutation({
  args: { ids: v.array(v.id("pushTokens")) },
  returns: v.null(),
  handler: async (ctx, { ids }) => {
    await Promise.all(ids.map((id) => ctx.db.delete(id)));
    return null;
  },
});

export const cleanupStalePushTokens = internalMutation({
  args: {},
  returns: v.object({ deleted: v.number(), hasMore: v.boolean() }),
  handler: async (ctx) => {
    const evt = new WideEvent("notifications.cleanupStalePushTokens");
    const cutoff = Date.now() - STALE_TOKEN_AGE_MS;
    const stale = await ctx.db
      .query("pushTokens")
      .withIndex("by_lastSeenAt", (q) => q.lt("lastSeenAt", cutoff))
      .take(STALE_TOKEN_CLEANUP_BATCH_SIZE);
    await Promise.all(stale.map((row) => ctx.db.delete(row._id)));
    const hasMore = stale.length === STALE_TOKEN_CLEANUP_BATCH_SIZE;
    if (hasMore) {
      // Self-reschedule until the table is drained so a backlog (e.g. after a
      // launch growth spike) doesn't exceed Convex's per-mutation budget.
      await ctx.scheduler.runAfter(0, internal.notifications.tokens.cleanupStalePushTokens, {});
    }
    evt.set({ deleted: stale.length, cutoff, hasMore }).emit();
    return { deleted: stale.length, hasMore };
  },
});
