import type { GenericMutationCtx } from "convex/server";

import type { DataModel, Id } from "../../_generated/dataModel";
import { selectGoalCandidateSectionIds } from "../../../src/feed/logic/servingPlan";
import type { ReactionSummary, ScoredDraft, ScoringConfig } from "../../../src/feed/logic/scoring";
import { fetchSectionEmbeddings } from "../learningGoal";

type MutationCtx = GenericMutationCtx<DataModel>;

export async function resolveGoalAwareSectionEmbeddings(
  ctx: MutationCtx,
  params: {
    goalEmbeddingByDocument: ReadonlyMap<string, number[]>;
    scoringInput: ScoredDraft[];
    config: ScoringConfig;
    reactionSummary: ReactionSummary;
    now: number;
  },
): Promise<{
  candidateSectionIds: string[];
  sectionEmbeddings: Map<string, number[]> | undefined;
  sectionEmbeddingCoverage: number;
}> {
  if (params.goalEmbeddingByDocument.size === 0) {
    return {
      candidateSectionIds: [],
      sectionEmbeddings: undefined,
      sectionEmbeddingCoverage: 1,
    };
  }

  const candidateSectionIds = selectGoalCandidateSectionIds({
    scoringInput: params.scoringInput,
    config: params.config,
    reactionSummary: params.reactionSummary,
    now: params.now,
  });
  const fetched = await fetchSectionEmbeddings(
    ctx,
    candidateSectionIds as Id<"sectionSummaries">[],
  );
  return {
    candidateSectionIds,
    sectionEmbeddings: fetched.embeddings,
    sectionEmbeddingCoverage: fetched.coverage,
  };
}
