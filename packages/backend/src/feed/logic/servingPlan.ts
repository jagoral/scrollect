import {
  computeBookDepthReach,
  computePostTypeMix,
  computeQualityDistribution,
  firstSessionDocuments,
  summarizeGoalRelevance,
} from "./servingAnalyticsMetrics";
import { scoreDrafts } from "./scoring";
import type { ReactionSummary, ScoredDraft, ScoredDraftWithScore, ScoringConfig } from "./scoring";

export const GOAL_CANDIDATE_FACTOR = 3;

export type DraftForServing = {
  id: string;
  documentId: string;
  sectionSummaryId?: string;
  postType: string;
  strategy: string;
  qualityScore: number;
  semanticQualityScore?: number;
  sectionQualitySignal?: number;
  servedCount: number;
  status: string;
  createdAt: number;
};

export type DocumentForServing = {
  createdAt: number;
  chunkCount: number;
};

export type SectionForServing = {
  chunkStartIndex: number;
  chunkEndIndex: number;
};

export function buildScoredDrafts(input: {
  drafts: DraftForServing[];
  documentsById: ReadonlyMap<string, DocumentForServing | null>;
  sectionsById: ReadonlyMap<string, SectionForServing | null>;
  draftsPerDocument: ReadonlyMap<string, number>;
}): ScoredDraft[] {
  return input.drafts.map((draft) => {
    const section = draft.sectionSummaryId
      ? input.sectionsById.get(draft.sectionSummaryId)
      : undefined;
    const document = input.documentsById.get(draft.documentId);

    return {
      id: draft.id,
      documentId: draft.documentId,
      sectionSummaryId: draft.sectionSummaryId,
      postType: draft.postType,
      strategy: draft.strategy,
      qualityScore: draft.qualityScore,
      semanticQualityScore: draft.semanticQualityScore,
      sectionQualitySignal: draft.sectionQualitySignal,
      servedCount: draft.servedCount,
      totalDraftsForDocument: input.draftsPerDocument.get(draft.documentId) ?? 1,
      documentCreatedAt: document?.createdAt ?? draft.createdAt,
      chunkStartIndex: section?.chunkStartIndex,
      documentChunkCount: document?.chunkCount,
    };
  });
}

export function selectGoalCandidateSectionIds(input: {
  scoringInput: ScoredDraft[];
  config: ScoringConfig;
  reactionSummary: ReactionSummary;
  now: number;
}): string[] {
  const candidatePass = scoreDrafts({
    drafts: input.scoringInput,
    config: input.config,
    now: input.now,
    reactionSummary: input.reactionSummary,
  });
  const candidateLimit = input.config.batchSize * GOAL_CANDIDATE_FACTOR;
  return [
    ...new Set(
      candidatePass
        .slice(0, candidateLimit)
        .map((draft) => draft.sectionSummaryId)
        .filter((id): id is string => id !== undefined),
    ),
  ];
}

export function rankDraftsForServing(input: {
  scoringInput: ScoredDraft[];
  config: ScoringConfig;
  reactionSummary: ReactionSummary;
  goalEmbeddingByDocument: ReadonlyMap<string, number[]>;
  sectionEmbeddings?: ReadonlyMap<string, number[]>;
  now: number;
}): ScoredDraftWithScore[] {
  return scoreDrafts({
    drafts: input.scoringInput,
    config: input.config,
    now: input.now,
    reactionSummary: input.reactionSummary,
    goalEmbeddingByDocument: input.goalEmbeddingByDocument,
    sectionEmbeddings: input.sectionEmbeddings,
  }).slice(0, input.config.batchSize);
}

export function countPendingServedDrafts(input: {
  topDrafts: ScoredDraftWithScore[];
  draftStatusById: ReadonlyMap<string, string>;
}): number {
  return input.topDrafts.filter((draft) => input.draftStatusById.get(draft.id) === "pending")
    .length;
}

export function summarizeDraftsPerDocument(draftsPerDocument: ReadonlyMap<string, number>): {
  min: number;
  max: number;
  avg: number;
  documentCount: number;
} {
  const draftCounts = [...draftsPerDocument.values()];
  return {
    min: Math.min(...draftCounts),
    max: Math.max(...draftCounts),
    avg: draftCounts.reduce((sum, n) => sum + n, 0) / draftCounts.length,
    documentCount: draftCounts.length,
  };
}

export function buildServingAnalyticsPayload(input: {
  drafts: DraftForServing[];
  topDrafts: ScoredDraftWithScore[];
  documentsById: ReadonlyMap<string, DocumentForServing | null>;
  draftsPerDocument: ReadonlyMap<string, number>;
  goalEmbeddingByDocument: ReadonlyMap<string, number[]>;
  sectionEmbeddings: ReadonlyMap<string, number[]> | undefined;
  sectionEmbeddingCoverage: number;
  candidateSectionIds: string[];
  config: ScoringConfig;
  now: number;
}) {
  const priorServedByDocument = new Map<string, number>();
  for (const draft of input.drafts) {
    priorServedByDocument.set(
      draft.documentId,
      (priorServedByDocument.get(draft.documentId) ?? 0) + draft.servedCount,
    );
  }

  const documentInputs = [...input.draftsPerDocument.keys()].map((documentId) => ({
    documentId,
    documentCreatedAt: input.documentsById.get(documentId)?.createdAt ?? 0,
    priorServedCount: priorServedByDocument.get(documentId) ?? 0,
  }));

  const firstSessionBatches = firstSessionDocuments({
    topDrafts: input.topDrafts,
    documentInputs,
    now: input.now,
  });
  const bookDepthReaches = firstSessionBatches
    .map(computeBookDepthReach)
    .filter((result): result is NonNullable<typeof result> => result !== null);

  const goalRelevance = summarizeGoalRelevance({
    goalEmbeddingByDocument: input.goalEmbeddingByDocument,
    topDrafts: input.topDrafts,
    sectionEmbeddings: input.sectionEmbeddings,
    candidateSectionIds: input.candidateSectionIds,
    goalRelevanceAlpha: input.config.goalRelevanceAlpha,
    goalRelevanceFloor: input.config.goalRelevanceFloor,
  });

  const goalRelevancePayload = goalRelevance.applied
    ? { ...goalRelevance, sectionEmbeddingCoveragePercent: input.sectionEmbeddingCoverage }
    : goalRelevance;

  return {
    bookDepthReaches,
    postTypeMixes: firstSessionBatches.map(computePostTypeMix),
    qualityDistribution: computeQualityDistribution(input.topDrafts) ?? undefined,
    goalRelevance: goalRelevancePayload,
  };
}
