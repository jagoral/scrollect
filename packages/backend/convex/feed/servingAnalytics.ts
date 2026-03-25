"use node";

import { v } from "convex/values";

import { internalAction } from "../_generated/server";
import { captureEvent } from "../providers/analytics";

export const captureServingAnalytics = internalAction({
  args: {
    userId: v.string(),
    cardCount: v.number(),
    elapsedMs: v.number(),
    isDepleted: v.boolean(),
    remainingPending: v.number(),
    replenishmentTriggered: v.boolean(),
  },
  returns: v.null(),
  handler: async (_ctx, args) => {
    await captureEvent({
      distinctId: args.userId,
      event: "feed.cards_served",
      properties: {
        count: args.cardCount,
        time_ms: args.elapsedMs,
      },
    });

    if (args.isDepleted) {
      await captureEvent({
        distinctId: args.userId,
        event: "feed.drafts_depleted",
        properties: {},
      });
    }

    if (args.replenishmentTriggered) {
      await captureEvent({
        distinctId: args.userId,
        event: "feed.replenishment_triggered",
        properties: {
          remaining_drafts: args.remainingPending,
        },
      });
    }

    return null;
  },
});
