import type { GenericMutationCtx } from "convex/server";

import { internal } from "../../_generated/api";
import type { DataModel, Id } from "../../_generated/dataModel";
import type { buildServingAnalyticsPayload } from "../../../src/feed/logic/servingPlan";
import type { ReactionStats } from "./reactions";

type MutationCtx = GenericMutationCtx<DataModel>;

export async function scheduleServingAnalytics(
  ctx: MutationCtx,
  params: {
    userId: string;
    postCount: number;
    elapsedMs: number;
    isDepleted: boolean;
    remainingPending: number;
    replenishmentTriggered: boolean;
    draftsPerDocumentStats: {
      min: number;
      max: number;
      avg: number;
      documentCount: number;
    };
    reactionStats: ReactionStats;
    analyticsPayload: ReturnType<typeof buildServingAnalyticsPayload>;
  },
): Promise<Id<"_scheduled_functions">> {
  return await ctx.scheduler.runAfter(0, internal.feed.servingAnalytics.captureServingAnalytics, {
    userId: params.userId,
    postCount: params.postCount,
    elapsedMs: params.elapsedMs,
    isDepleted: params.isDepleted,
    remainingPending: params.remainingPending,
    replenishmentTriggered: params.replenishmentTriggered,
    draftsPerDocumentStats: params.draftsPerDocumentStats,
    reactionStats: params.reactionStats,
    ...params.analyticsPayload,
  });
}
