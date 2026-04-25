import type { GenericMutationCtx, GenericQueryCtx } from "convex/server";

import type { DataModel, Id } from "../_generated/dataModel";

/**
 * Resolver seam for the learning-goal vector used by feed scoring (ADR-018 §3, ADR-019).
 *
 * Resolution order is `topic → document → undefined`:
 *  1. If the document is assigned to a topic and that topic has a `learningGoalEmbedding`,
 *     return the topic's embedding. Topics are a personal goal-scoped lens over a subset
 *     of documents; ranking against the topic vector lets users focus the feed.
 *  2. Otherwise, return the document's own `learningGoalEmbedding` (the per-document goal
 *     a user set during onboarding or on the document detail page).
 *  3. Otherwise, return `undefined`. The serving scorer treats `undefined` as
 *     `goalRelevance = 1.0`.
 *
 * Scoring code calls this helper and stays topic-agnostic. The schema permits multiple
 * `documentTopics` rows per document so future multi-select doesn't require a migration;
 * v1 UI is single-select, but if multiple rows exist the most-recent one wins.
 *
 * Note: `userProfiles.learningGoalEmbedding` is intentionally not consulted - per ADR-019,
 * the per-document goal is the ultimate fallback, never a profile-level default.
 */
export async function getEffectiveLearningGoalEmbedding(
  ctx: GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel>,
  documentId: Id<"documents">,
): Promise<number[] | undefined> {
  const assignments = await ctx.db
    .query("documentTopics")
    .withIndex("by_documentId", (q) => q.eq("documentId", documentId))
    .collect();

  if (assignments.length > 0) {
    const mostRecent = assignments.reduce((best, current) =>
      current.createdAt > best.createdAt ? current : best,
    );
    const topic = await ctx.db.get(mostRecent.topicId);
    if (topic?.learningGoalEmbedding && topic.learningGoalEmbedding.length > 0) {
      return topic.learningGoalEmbedding;
    }
  }

  const doc = await ctx.db.get(documentId);
  return doc?.learningGoalEmbedding ?? undefined;
}

/**
 * Fetch section-summary embeddings for a set of section IDs. Used by the feed scorer to
 * compute learning-goal cosine similarity for the top-K candidate drafts (ADR-018 §3).
 *
 * Section vectors live in Qdrant for cross-document search; the Convex `embedding` column
 * is a read-side denormalization populated at summarization time. Sections lacking an
 * embedding (pre-ADR-018 rows, or documents still mid-processing) are simply absent from
 * the returned map — callers default those drafts to `goalRelevance = 1.0`.
 *
 * Returns a `{ embeddings, coverage }` tuple where `coverage` is the fraction of requested
 * sections that had an embedding. Task-6 analytics uses `coverage` to distinguish
 * "goal off" from "degraded to 1.0 due to missing embeddings."
 */
export async function fetchSectionEmbeddings(
  ctx: GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel>,
  sectionIds: Id<"sectionSummaries">[],
): Promise<{ embeddings: Map<string, number[]>; coverage: number }> {
  if (sectionIds.length === 0) return { embeddings: new Map(), coverage: 1 };

  const uniqueIds = [...new Set(sectionIds)];
  const rows = await Promise.all(uniqueIds.map((id) => ctx.db.get(id)));

  const embeddings = new Map<string, number[]>();
  for (const row of rows) {
    if (row && row.embedding && row.embedding.length > 0) {
      embeddings.set(row._id as string, row.embedding);
    }
  }
  return {
    embeddings,
    coverage: uniqueIds.length === 0 ? 1 : embeddings.size / uniqueIds.length,
  };
}
