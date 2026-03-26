"use node";

import { v } from "convex/values";

import { internalAction } from "../_generated/server";
import { captureEvent } from "../../src/providers/analytics";

export const captureServingAnalytics = internalAction({
  args: {
    userId: v.string(),
    cardCount: v.number(),
    elapsedMs: v.number(),
    isDepleted: v.boolean(),
    remainingPending: v.number(),
    replenishmentTriggered: v.boolean(),
    draftsPerDocumentStats: v.optional(
      v.object({
        min: v.number(),
        max: v.number(),
        avg: v.number(),
        documentCount: v.number(),
      }),
    ),
    reactionStats: v.optional(
      v.object({
        totalLikes: v.number(),
        totalDislikes: v.number(),
        dislikesByReason: v.record(v.string(), v.number()),
        penalizedSections: v.number(),
        penalizedCardTypes: v.number(),
        rejectedDrafts: v.number(),
      }),
    ),
  },
  returns: v.null(),
  handler: async (_ctx, args) => {
    await captureEvent({
      distinctId: args.userId,
      event: "feed.cards_served",
      properties: {
        count: args.cardCount,
        time_ms: args.elapsedMs,
        ...(args.draftsPerDocumentStats && {
          drafts_per_document_min: args.draftsPerDocumentStats.min,
          drafts_per_document_max: args.draftsPerDocumentStats.max,
          drafts_per_document_avg: args.draftsPerDocumentStats.avg,
          document_count: args.draftsPerDocumentStats.documentCount,
        }),
        ...(args.reactionStats && {
          reaction_total_likes: args.reactionStats.totalLikes,
          reaction_total_dislikes: args.reactionStats.totalDislikes,
          reaction_dislikes_by_reason: args.reactionStats.dislikesByReason,
          reaction_penalized_sections: args.reactionStats.penalizedSections,
          reaction_penalized_card_types: args.reactionStats.penalizedCardTypes,
          reaction_rejected_drafts: args.reactionStats.rejectedDrafts,
        }),
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
