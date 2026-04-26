import type { GenericMutationCtx, GenericQueryCtx } from "convex/server";

import type { DataModel, Id } from "../_generated/dataModel";
import { pickActiveTopicForDocument } from "../../src/feed/logic/pickActiveTopicForDocument";

/**
 * Tagged result of the goal-embedding resolver. The `source` discriminator drives
 * the `goalSource*Count` analytics breakdown on the serving wide event so we can tell
 * "topic-scoped goal", "per-document goal", and "no goal at all" apart in dashboards.
 *
 * The `embedding` payload is `undefined` only on the `none` branch; consumers should
 * treat that as "no goal" and default `goalRelevance` to 1.0.
 */
export type EffectiveGoalEmbedding =
  | { source: "topic"; embedding: number[] }
  | { source: "document"; embedding: number[] }
  | { source: "none"; embedding: undefined };

/**
 * Resolver seam for the learning-goal vector used by feed scoring (ADR-018 §3, ADR-019).
 *
 * Resolution order is `topic → document → none`:
 *  1. If the document is assigned to a topic and that topic has a `learningGoalEmbedding`,
 *     return the topic's embedding. Topics are a personal goal-scoped lens over a subset
 *     of documents; ranking against the topic vector lets users focus the feed.
 *  2. Otherwise, return the document's own `learningGoalEmbedding` (the per-document goal
 *     a user set during onboarding or on the document detail page).
 *  3. Otherwise, return `{ source: "none", embedding: undefined }`. The serving scorer
 *     treats `undefined` as `goalRelevance = 1.0`.
 *
 * Scoring code calls this helper and stays topic-agnostic. The schema permits multiple
 * `documentTopics` rows per document so future multi-select doesn't require a migration;
 * v1 UI is single-select, but if multiple rows exist the most-recent one wins (see
 * `pickActiveTopicForDocument`).
 *
 * Note: `userProfiles.learningGoalEmbedding` is intentionally not consulted - per ADR-019,
 * the per-document goal is the ultimate fallback, never a profile-level default.
 */
export async function getEffectiveLearningGoalEmbedding(
  ctx: GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel>,
  documentId: Id<"documents">,
): Promise<EffectiveGoalEmbedding> {
  const assignments = await ctx.db
    .query("documentTopics")
    .withIndex("by_documentId", (q) => q.eq("documentId", documentId))
    .collect();

  const activeTopicId = pickActiveTopicForDocument(
    assignments.map((a) => ({ topicId: a.topicId as string, createdAt: a.createdAt })),
  );

  if (activeTopicId !== undefined) {
    const topic = await ctx.db.get(activeTopicId as Id<"topics">);
    if (topic?.learningGoalEmbedding && topic.learningGoalEmbedding.length > 0) {
      return { source: "topic", embedding: topic.learningGoalEmbedding };
    }
  }

  const doc = await ctx.db.get(documentId);
  if (doc?.learningGoalEmbedding && doc.learningGoalEmbedding.length > 0) {
    return { source: "document", embedding: doc.learningGoalEmbedding };
  }
  return { source: "none", embedding: undefined };
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
