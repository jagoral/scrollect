import type { TopicEmbeddingServiceContext } from "../providers/types";

export type EmbedTopicGoalInput = { topicId: string; learningGoal: string };

export type EmbedTopicGoalOutput =
  | { skipped: "empty_goal" | "empty_vector" }
  | { embedding: number[] };

/**
 * Embeds a topic's learning goal. Pure orchestration: ownership checks, persistence,
 * and analytics live in the Convex action that wraps this. Mirrors the per-document
 * `embedLearningGoal` flow (see `convex/content/documentActions.ts`).
 *
 * Returns:
 *  - `{ skipped: "empty_goal" }` if the goal trims to an empty string.
 *  - `{ skipped: "empty_vector" }` if the embedder returns no vector or an empty array.
 *  - `{ embedding }` on success.
 *
 * The function never throws on legitimate empty inputs; provider failures (network
 * errors, etc.) propagate so the caller can decide whether to no-op or retry. Matching
 * the document-level helper, the action wrapping this should `evt.setError()` and
 * return null instead of throwing — goal relevance falls back to 1.0 when the embedding
 * is missing, so failing open preserves ranking correctness.
 */
export async function embedTopicGoal(
  ctx: TopicEmbeddingServiceContext,
  input: EmbedTopicGoalInput,
): Promise<EmbedTopicGoalOutput> {
  const trimmed = input.learningGoal.trim();
  if (trimmed.length === 0) {
    return { skipped: "empty_goal" };
  }

  const [vector] = await ctx.embedder.embed([trimmed]);
  if (!vector || vector.length === 0) {
    return { skipped: "empty_vector" };
  }

  return { embedding: vector };
}
