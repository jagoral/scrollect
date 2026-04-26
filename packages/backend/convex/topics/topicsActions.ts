"use node";

import { ConvexError, v } from "convex/values";

import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { WideEvent } from "../../src/platform/logging";
import { captureEvent } from "../../src/providers/analytics/posthog";
import { embedTopicGoal as embedTopicGoalLogic } from "../../src/topics/embedTopicGoal";
import { createTopicEmbeddingServiceContext } from "./services";

const topicAnalyticsPayload = v.union(
  v.object({
    event: v.literal("topic_created"),
    properties: v.object({
      topic_id: v.id("topics"),
      has_description: v.boolean(),
      has_color: v.boolean(),
      has_icon: v.boolean(),
    }),
  }),
  v.object({
    event: v.literal("topic_goal_edited"),
    properties: v.object({
      topic_id: v.id("topics"),
    }),
  }),
  v.object({
    event: v.literal("topic_deleted"),
    properties: v.object({
      topic_id: v.id("topics"),
      document_count: v.number(),
    }),
  }),
  v.object({
    event: v.literal("document_assigned_to_topic"),
    properties: v.object({
      topic_id: v.id("topics"),
      document_id: v.id("documents"),
    }),
  }),
  v.object({
    event: v.literal("document_removed_from_topic"),
    properties: v.object({
      topic_id: v.id("topics"),
      document_id: v.id("documents"),
    }),
  }),
);

/**
 * Embeds a topic's learning goal and patches `topics.learningGoalEmbedding`. Mirrors
 * the per-document `embedLearningGoal` action. The embedding model is the same as
 * the one used for section summaries so cosine similarity at serve time is meaningful.
 *
 * Per ADR-012 this is a thin Convex edge: rate limit, providers, scheduling, analytics
 * here; the embedding orchestration lives in `src/topics/embedTopicGoal.ts`. Missing /
 * empty goal, embedding failure, and provider misconfiguration all no-op instead of
 * throwing — goal relevance defaults to 1.0 when the embedding is absent, so failing
 * open preserves ranking correctness.
 */
export const embedTopicGoal = internalAction({
  args: {
    topicId: v.id("topics"),
    learningGoal: v.string(),
    /**
     * Owning user id. Optional for backward-compat with any in-flight scheduled
     * jobs from the previous version of this action; new schedulers always supply
     * it so we can rate-limit per user.
     */
    userId: v.optional(v.string()),
    userCreatedAt: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const evt = new WideEvent("topicsActions.embedTopicGoal");
    evt.set("topicId", args.topicId);
    try {
      if (args.userId !== undefined && args.userCreatedAt !== undefined) {
        const limit = await ctx.runMutation(internal.lib.rateLimitChecks.enforceTopicEmbedLimit, {
          userId: args.userId,
          userCreatedAt: args.userCreatedAt,
        });
        if (!limit.ok) {
          evt.set({ rateLimited: true, retryAfterMs: limit.retryAfter });
          throw new ConvexError({
            kind: "RateLimited" as const,
            name: "topicEmbed",
            retryAfter: limit.retryAfter,
          });
        }
      }

      const services = createTopicEmbeddingServiceContext();
      const result = await embedTopicGoalLogic(services, {
        topicId: args.topicId,
        learningGoal: args.learningGoal,
      });

      if ("skipped" in result) {
        evt.set("skipped", result.skipped);
        return null;
      }

      await ctx.runMutation(internal.topics.topics.setTopicLearningGoalEmbedding, {
        topicId: args.topicId,
        embedding: result.embedding,
      });
      evt.set({ embeddingDimensions: result.embedding.length });
      return null;
    } catch (error) {
      evt.setError(error);
      // Re-throw rate-limit errors so the scheduler surfaces them; swallow other
      // errors (network/provider) since goal relevance falls back to 1.0 when
      // the embedding is missing. Tag the skip reason so operators can grep for
      // provider-side failures distinct from the empty-goal / empty-vector skips.
      if (error instanceof ConvexError) throw error;
      evt.set("skipped", "provider_error");
      return null;
    } finally {
      evt.emit();
    }
  },
});

export const captureTopicAnalytics = internalAction({
  args: {
    userId: v.string(),
    payload: topicAnalyticsPayload,
  },
  returns: v.null(),
  handler: async (_ctx, args) => {
    await captureEvent({
      distinctId: args.userId,
      event: args.payload.event,
      properties: args.payload.properties,
    });
    return null;
  },
});
