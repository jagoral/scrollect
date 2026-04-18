import { v } from "convex/values";

import { components, internal } from "./_generated/api";
import { internalAction, internalMutation } from "./_generated/server";
import { EARLY_ADOPTER_CUTOFF, insertEarlyAdopterGrantIfMissing } from "./entitlementGrants";
import { WideEvent } from "./lib/logging";

/**
 * One-shot migration: grants Early Adopter status to every user whose
 * better-auth `createdAt` predates `EARLY_ADOPTER_CUTOFF`. Runs as an action
 * that paginates the better-auth component's `user` table and dispatches
 * per-batch mutations. Idempotent — re-running skips users whose grant row
 * already exists.
 *
 * Invoke from the Convex dashboard:
 *   ctx.runAction(internal.migrateEarlyAdopters.runGrantEarlyAdopters, {})
 */

// One grant batch does up to BATCH_SIZE read+insert pairs. Convex caps each
// transaction at 4096 reads/writes, so 100 leaves ample headroom and keeps
// per-batch latency small.
const BATCH_SIZE = 100;

export const grantEarlyAdoptersBatch = internalMutation({
  args: {
    userIds: v.array(v.string()),
  },
  returns: v.object({
    attempted: v.number(),
    inserted: v.number(),
    skipped: v.number(),
  }),
  handler: async (ctx, args) => {
    let inserted = 0;
    let skipped = 0;
    for (const userId of args.userIds) {
      const result = await insertEarlyAdopterGrantIfMissing(ctx, {
        userId,
        source: "migration",
        note: "Early Adopter migration (pre-paywall user)",
      });
      if (result.inserted) inserted++;
      else skipped++;
    }
    return { attempted: args.userIds.length, inserted, skipped };
  },
});

export const runGrantEarlyAdopters = internalAction({
  args: {},
  returns: v.object({
    totalUsers: v.number(),
    eligible: v.number(),
    inserted: v.number(),
    skipped: v.number(),
    batches: v.number(),
  }),
  handler: async (ctx) => {
    const evt = new WideEvent("migration.grantEarlyAdopters");

    let cursor: string | null = null;
    let totalUsers = 0;
    let eligible = 0;
    let inserted = 0;
    let skipped = 0;
    let batches = 0;

    try {
      while (true) {
        const page: {
          page: Array<{ _id: string; createdAt: number }>;
          isDone: boolean;
          continueCursor: string;
        } = await ctx.runQuery(components.betterAuth.adapter.findMany, {
          model: "user",
          paginationOpts: { cursor, numItems: BATCH_SIZE },
        });

        totalUsers += page.page.length;
        // Defensive guard: the better-auth schema types `createdAt` as a number,
        // but the adapter's response is typed as `GenericDocument`. Skip any
        // row whose shape has drifted rather than comparing garbage.
        const eligibleIds = page.page
          .filter(
            (user) => typeof user.createdAt === "number" && user.createdAt < EARLY_ADOPTER_CUTOFF,
          )
          .map((user) => user._id);
        eligible += eligibleIds.length;

        if (eligibleIds.length > 0) {
          const result = await ctx.runMutation(
            internal.migrateEarlyAdopters.grantEarlyAdoptersBatch,
            { userIds: eligibleIds },
          );
          inserted += result.inserted;
          skipped += result.skipped;
        }

        batches++;
        if (page.isDone) break;
        cursor = page.continueCursor;
      }

      evt.set({ totalUsers, eligible, inserted, skipped, batches });
      return { totalUsers, eligible, inserted, skipped, batches };
    } catch (error) {
      evt.set({ totalUsers, eligible, inserted, skipped, batches });
      evt.setError(error);
      throw error;
    } finally {
      evt.emit();
    }
  },
});
