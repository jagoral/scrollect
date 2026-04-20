import { describe, expect, it } from "vitest";

import { DEFAULT_SCORING_CONFIG, type ReactionSummary } from "../../../src/feed/logic/scoring";
import { buildServingConfig, documentFeedScope } from "../../../src/feed/logic/servingScope";
import {
  rankDraftsForServing,
  selectGoalCandidateSectionIds,
  type DraftForServing,
} from "../../../src/feed/logic/servingPlan";

const NOW = 1_700_000_000_000;

const emptyReactionSummary: ReactionSummary = {
  dislikedSections: new Map(),
  dislikedPostTypes: new Set(),
  likedSections: new Set(),
  likedPostTypes: new Set(),
  rejectedDraftIds: new Set(),
};

function makeServingDraft(overrides: Partial<DraftForServing> = {}): DraftForServing {
  return {
    id: "draft-1",
    documentId: "doc-1",
    sectionSummaryId: "section-1",
    postType: "insight",
    strategy: "section",
    qualityScore: 0.8,
    semanticQualityScore: 0.8,
    sectionQualitySignal: 0.8,
    servedCount: 0,
    status: "pending",
    createdAt: NOW,
    ...overrides,
  };
}

describe("serving plan", () => {
  it("does not promote other documents when ranking a document-scoped feed", () => {
    const drafts = [
      makeServingDraft({ id: "doc-1-a", qualityScore: 0.99, sectionSummaryId: "section-a" }),
      makeServingDraft({ id: "doc-1-b", qualityScore: 0.98, sectionSummaryId: "section-b" }),
      makeServingDraft({ id: "doc-1-c", qualityScore: 0.97, sectionSummaryId: "section-c" }),
      makeServingDraft({ id: "doc-2-low", documentId: "doc-2", qualityScore: 0.1 }),
    ];
    const scoringInput = drafts.map((draft) => ({
      id: draft.id,
      documentId: draft.documentId,
      sectionSummaryId: draft.sectionSummaryId,
      postType: draft.postType,
      strategy: draft.strategy,
      qualityScore: draft.qualityScore,
      semanticQualityScore: draft.semanticQualityScore,
      sectionQualitySignal: draft.sectionQualitySignal,
      servedCount: draft.servedCount,
      totalDraftsForDocument: 4,
      documentCreatedAt: draft.createdAt,
    }));
    const config = {
      ...buildServingConfig(documentFeedScope("doc-1")),
      batchSize: 4,
      sectionDiversityCap: 1,
    };

    const result = rankDraftsForServing({
      scoringInput,
      config,
      reactionSummary: emptyReactionSummary,
      goalEmbeddingByDocument: new Map(),
      now: NOW,
    });

    expect(result.map((draft) => draft.id)).toEqual(["doc-1-a", "doc-1-b", "doc-1-c", "doc-2-low"]);
  });

  it("limits learning-goal candidates to three batches of deduped top sections", () => {
    const scoringInput = [
      makeServingDraft({ id: "draft-a", sectionSummaryId: "section-a", qualityScore: 0.99 }),
      makeServingDraft({
        id: "draft-a-duplicate",
        sectionSummaryId: "section-a",
        qualityScore: 0.98,
      }),
      makeServingDraft({ id: "draft-b", sectionSummaryId: "section-b", qualityScore: 0.97 }),
      makeServingDraft({ id: "draft-c", sectionSummaryId: "section-c", qualityScore: 0.96 }),
      makeServingDraft({ id: "draft-d", sectionSummaryId: "section-d", qualityScore: 0.95 }),
      makeServingDraft({ id: "draft-e", sectionSummaryId: "section-e", qualityScore: 0.94 }),
    ].map((draft) => ({
      id: draft.id,
      documentId: draft.documentId,
      sectionSummaryId: draft.sectionSummaryId,
      postType: draft.postType,
      strategy: draft.strategy,
      qualityScore: draft.qualityScore,
      semanticQualityScore: draft.semanticQualityScore,
      sectionQualitySignal: draft.sectionQualitySignal,
      servedCount: draft.servedCount,
      totalDraftsForDocument: 6,
      documentCreatedAt: draft.createdAt,
    }));
    const config = { ...DEFAULT_SCORING_CONFIG, batchSize: 2 };

    const result = selectGoalCandidateSectionIds({
      scoringInput,
      config,
      reactionSummary: emptyReactionSummary,
      now: NOW,
    });

    expect(result).toEqual(["section-a", "section-b", "section-c", "section-d", "section-e"]);
  });
});
