import { migrations } from "../migrations";

/**
 * Backfill `posts.topicId` from `documentTopics` (B1, ADR-019).
 *
 * Runs over the `posts` table. For each post:
 *  - Look up the active topic for its `primarySourceDocumentId` (most-recent
 *    assignment in `documentTopics`).
 *  - If a topic is found and the post does not already have a matching `topicId`,
 *    patch the column. Posts whose document has no topic assignment are left as-is
 *    (column stays `undefined`).
 *
 * Idempotent: re-running short-circuits when the column already matches.
 */
export const backfillPostTopicId = migrations.define({
  table: "posts",
  migrateOne: async (ctx, post) => {
    const assignments = await ctx.db
      .query("documentTopics")
      .withIndex("by_documentId", (q) => q.eq("documentId", post.primarySourceDocumentId))
      .collect();

    if (assignments.length === 0) {
      // No assignments — leave undefined.
      if (post.topicId !== undefined) {
        await ctx.db.patch(post._id, { topicId: undefined });
      }
      return;
    }

    let mostRecent = assignments[0]!;
    for (let i = 1; i < assignments.length; i += 1) {
      const candidate = assignments[i]!;
      if (candidate.createdAt > mostRecent.createdAt) mostRecent = candidate;
    }

    if (post.topicId !== mostRecent.topicId) {
      await ctx.db.patch(post._id, { topicId: mostRecent.topicId });
    }
  },
});
