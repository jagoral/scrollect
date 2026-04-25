"use node";

import { v } from "convex/values";

import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { WideEvent } from "../../src/platform/logging";
import { captureEvent } from "../../src/providers/analytics/posthog";
import { createEmbeddingProvider } from "../../src/providers/wiring";

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
 * Missing / empty goal, embedding failure, or provider misconfiguration all no-op
 * instead of throwing. The serving scorer falls back to the per-document goal when a
 * topic has no embedding (resolver order: topic -> document -> undefined).
 */
export const embedTopicGoal = internalAction({
  args: {
    topicId: v.id("topics"),
    learningGoal: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const evt = new WideEvent("topicsActions.embedTopicGoal");
    evt.set("topicId", args.topicId);
    try {
      const trimmed = args.learningGoal.trim();
      if (trimmed.length === 0) {
        evt.set("skipped", "empty_goal");
        return null;
      }

      const embedder = createEmbeddingProvider();
      const [vector] = await embedder.embed([trimmed]);
      if (!vector || vector.length === 0) {
        evt.set("skipped", "empty_vector");
        return null;
      }

      await ctx.runMutation(internal.topics.topics.setTopicLearningGoalEmbedding, {
        topicId: args.topicId,
        embedding: vector,
      });
      evt.set({ embeddingDimensions: vector.length });
      return null;
    } catch (error) {
      evt.setError(error);
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
