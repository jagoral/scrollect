import type { GenericMutationCtx } from "convex/server";

import type { DataModel, Id } from "../../_generated/dataModel";
import { getEffectiveLearningGoalEmbedding } from "../learningGoal";

type MutationCtx = GenericMutationCtx<DataModel>;

export async function resolveGoalEmbeddings(
  ctx: MutationCtx,
  params: { documentIds: Id<"documents">[] },
): Promise<Map<string, number[]>> {
  const goalResolutions = await Promise.all(
    params.documentIds.map(async (id) => ({
      id,
      embedding: await getEffectiveLearningGoalEmbedding(ctx, id),
    })),
  );

  const goalEmbeddingByDocument = new Map<string, number[]>();
  for (const { id, embedding } of goalResolutions) {
    if (embedding !== undefined) goalEmbeddingByDocument.set(id, embedding);
  }
  return goalEmbeddingByDocument;
}
