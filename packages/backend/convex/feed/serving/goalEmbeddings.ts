import type { GenericMutationCtx } from "convex/server";

import type { DataModel, Id } from "../../_generated/dataModel";
import { getEffectiveLearningGoalEmbedding } from "../learningGoal";

type MutationCtx = GenericMutationCtx<DataModel>;

export type GoalSourceCounts = {
  topic: number;
  document: number;
  none: number;
};

export type ResolvedGoalEmbeddings = {
  /** Per-document goal embedding map. Documents whose goal source is `none` are absent. */
  byDocument: Map<string, number[]>;
  /** Count of documents resolved by each source — used as serving wide-event telemetry. */
  sourceCounts: GoalSourceCounts;
};

export async function resolveGoalEmbeddings(
  ctx: MutationCtx,
  params: { documentIds: Id<"documents">[] },
): Promise<ResolvedGoalEmbeddings> {
  const goalResolutions = await Promise.all(
    params.documentIds.map(async (id) => ({
      id,
      result: await getEffectiveLearningGoalEmbedding(ctx, id),
    })),
  );

  const byDocument = new Map<string, number[]>();
  const sourceCounts: GoalSourceCounts = { topic: 0, document: 0, none: 0 };
  for (const { id, result } of goalResolutions) {
    sourceCounts[result.source] += 1;
    if (result.source !== "none") {
      byDocument.set(id, result.embedding);
    }
  }
  return { byDocument, sourceCounts };
}
