import type { GenericMutationCtx } from "convex/server";

import { internal } from "../../_generated/api";
import type { DataModel } from "../../_generated/dataModel";

type MutationCtx = GenericMutationCtx<DataModel>;

const REPLENISHMENT_COOLDOWN_MS = 60_000;

export async function maybeScheduleReplenishment(
  ctx: MutationCtx,
  params: { userId: string },
): Promise<boolean> {
  const recentPending = await ctx.db
    .query("postDrafts")
    .withIndex("by_userId_status", (q) => q.eq("userId", params.userId).eq("status", "pending"))
    .order("desc")
    .first();

  if (recentPending && Date.now() - recentPending._creationTime < REPLENISHMENT_COOLDOWN_MS) {
    return false;
  }

  await ctx.scheduler.runAfter(0, internal.drafting.postDraftReplenishment.regenerateDrafts, {
    userId: params.userId,
  });
  return true;
}
