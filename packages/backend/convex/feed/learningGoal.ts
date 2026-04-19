import type { GenericMutationCtx, GenericQueryCtx } from "convex/server";

import type { DataModel, Id } from "../_generated/dataModel";

/**
 * Resolver seam for the learning-goal vector used by feed scoring.
 *
 * Today it returns `documents.learningGoalEmbedding` for the given document. The vector
 * is colocated with the `learningGoal` text on the same document so edits on one
 * document never trample another document's goal. When per-topic goals ship
 * (ADR-018 §3 future-ready resolver seam), this function will look up the document's
 * topic, resolve the topic's embedding, and fall back to the per-document default.
 * Scoring code calls this helper and stays topic-agnostic.
 *
 * Returns `undefined` when the document has no learning goal or the embedding has
 * not yet been computed (scheduled action still pending, or provider error). The
 * serving scorer treats `undefined` as `goalRelevance = 1.0`.
 */
export async function getEffectiveLearningGoalEmbedding(
  ctx: GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel>,
  documentId: Id<"documents">,
): Promise<number[] | undefined> {
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
