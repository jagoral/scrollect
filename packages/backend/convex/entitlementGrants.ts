import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

import { WideEvent } from "../src/platform/logging";

/**
 * Frozen cutoff: users whose auth `createdAt` is earlier than this timestamp
 * are eligible for an Early Adopter grant. Set to just before the feature
 * merged; moving this value would retroactively grant or ungrant users, so it
 * must remain stable.
 *
 * 2026-04-18T00:00:00Z
 */
export const EARLY_ADOPTER_CUTOFF = 1776211200000;

/**
 * Per-period document quota window for grant-eligible users. The grant itself
 * is perpetual — only the usage counter rolls (rolling `now - 30d`).
 */
export const GRANT_ROLLING_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export type GrantSource = "migration" | "admin";

export async function findGrantByUserId(
  ctx: QueryCtx,
  userId: string,
): Promise<Doc<"entitlementGrants"> | null> {
  return await ctx.db
    .query("entitlementGrants")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .first();
}

export async function hasEarlyAdopterEntitlement(
  ctx: QueryCtx,
  args: { userId: string; userCreatedAt: number },
): Promise<boolean> {
  const grant = await findGrantByUserId(ctx, args.userId);
  if (grant) return true;
  return args.userCreatedAt < EARLY_ADOPTER_CUTOFF;
}

export async function insertEarlyAdopterGrantIfMissing(
  ctx: MutationCtx,
  args: { userId: string; source: GrantSource; note?: string },
): Promise<{ inserted: boolean; grantId: Doc<"entitlementGrants">["_id"] }> {
  const existing = await findGrantByUserId(ctx, args.userId);
  if (existing) {
    return { inserted: false, grantId: existing._id };
  }
  const grantId = await ctx.db.insert("entitlementGrants", {
    userId: args.userId,
    grantType: "early_adopter",
    tier: "pro",
    grantedAt: Date.now(),
    note: args.note,
  });
  new WideEvent("entitlementGrant.created")
    .set({
      userId: args.userId,
      grantType: "early_adopter",
      tier: "pro",
      source: args.source,
    })
    .emit();
  return { inserted: true, grantId };
}
