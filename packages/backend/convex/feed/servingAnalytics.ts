"use node";

import { v } from "convex/values";

import { internal } from "../_generated/api";
import type { ActionCtx } from "../_generated/server";
import { internalAction } from "../_generated/server";
import { isE2EEnabled } from "../../src/platform/e2e";
import { captureEvent } from "../../src/providers/analytics/posthog";

async function emit(
  ctx: ActionCtx,
  userId: string,
  event: string,
  properties: Record<string, unknown>,
) {
  await captureEvent({ distinctId: userId, event, properties });
  if (isE2EEnabled()) {
    await ctx.runMutation(internal.ops.testing.recordE2EAnalyticsEvent, {
      userId,
      event,
      properties,
    });
  }
}

const bookDepthReachValidator = v.object({
  documentId: v.string(),
  cardCount: v.number(),
  maxBookPosition: v.number(),
  minBookPosition: v.number(),
  spreadBookPosition: v.number(),
  populatedQuartiles: v.number(),
});

const cardTypeMixValidator = v.object({
  documentId: v.string(),
  cardCount: v.number(),
  // Flat record (card type -> count). PostHog ingests this shape cleanly and the key set
  // is small and stable (insight, quiz, quote, summary).
  mix: v.record(v.string(), v.number()),
});

const qualityDistributionValidator = v.object({
  totalCards: v.number(),
  mean: v.number(),
  std: v.number(),
  belowThreshold07Share: v.number(),
  // Histogram bucket label -> count. Labels are fixed by
  // `QUALITY_DISTRIBUTION_BUCKETS` in the pure metrics module.
  buckets: v.record(v.string(), v.number()),
});

const goalRelevanceValidator = v.object({
  applied: v.boolean(),
  sectionEmbeddingCoveragePercent: v.number(),
  meanRelevanceBoost: v.number(),
  boostedCardCount: v.number(),
});

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
    // ADR-018 §7: per-first-session-document metrics. Batch-indexed by documentId so PostHog
    // can aggregate across documents without deep nesting.
    bookDepthReaches: v.optional(v.array(bookDepthReachValidator)),
    cardTypeMixes: v.optional(v.array(cardTypeMixValidator)),
    qualityDistribution: v.optional(qualityDistributionValidator),
    goalRelevance: v.optional(goalRelevanceValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await emit(ctx, args.userId, "feed.cards_served", {
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
    });

    if (args.isDepleted) {
      await emit(ctx, args.userId, "feed.drafts_depleted", {});
    }

    if (args.replenishmentTriggered) {
      await emit(ctx, args.userId, "feed.replenishment_triggered", {
        remaining_drafts: args.remainingPending,
      });
    }

    if (args.bookDepthReaches && args.bookDepthReaches.length > 0) {
      for (const reach of args.bookDepthReaches) {
        await emit(ctx, args.userId, "feed.first_session_book_depth_reach", {
          document_id: reach.documentId,
          card_count: reach.cardCount,
          max_book_position: reach.maxBookPosition,
          min_book_position: reach.minBookPosition,
          spread_book_position: reach.spreadBookPosition,
          populated_quartiles: reach.populatedQuartiles,
        });
      }
    }

    if (args.cardTypeMixes && args.cardTypeMixes.length > 0) {
      for (const mix of args.cardTypeMixes) {
        await emit(ctx, args.userId, "feed.first_session_card_type_mix", {
          document_id: mix.documentId,
          card_count: mix.cardCount,
          // Shallow record of counts; PostHog ingests this reliably.
          type_mix: mix.mix,
        });
      }
    }

    if (args.qualityDistribution) {
      await emit(ctx, args.userId, "feed.serving_quality_score_distribution", {
        total_cards: args.qualityDistribution.totalCards,
        mean: args.qualityDistribution.mean,
        std: args.qualityDistribution.std,
        below_threshold_0_7_share: args.qualityDistribution.belowThreshold07Share,
        buckets: args.qualityDistribution.buckets,
      });
    }

    if (args.goalRelevance) {
      await emit(ctx, args.userId, "feed.learning_goal_relevance_applied", {
        applied: args.goalRelevance.applied,
        section_embedding_coverage_percent: args.goalRelevance.sectionEmbeddingCoveragePercent,
        mean_relevance_boost: args.goalRelevance.meanRelevanceBoost,
        boosted_card_count: args.goalRelevance.boostedCardCount,
      });
    }

    return null;
  },
});
