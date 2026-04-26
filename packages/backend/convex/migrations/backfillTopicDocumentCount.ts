import { migrations } from "../migrations";

/**
 * Backfill `topics.documentCount` from `documentTopics` (B3).
 *
 * Runs over the `topics` table. For each topic, counts the number of
 * `documentTopics` rows pointing at it (`by_topicId` index) and patches
 * `documentCount` if the stored value diverges. The 100x batch size from the
 * default runner keeps this cheap even with many topics.
 *
 * Idempotent: re-running short-circuits when the count already matches.
 */
export const backfillTopicDocumentCount = migrations.define({
  table: "topics",
  migrateOne: async (ctx, topic) => {
    const assignments = await ctx.db
      .query("documentTopics")
      .withIndex("by_topicId", (q) => q.eq("topicId", topic._id))
      .collect();

    const next = assignments.length;
    if ((topic.documentCount ?? -1) !== next) {
      await ctx.db.patch(topic._id, { documentCount: next });
    }
  },
});
