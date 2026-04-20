import { describe, expect, it } from "vitest";

import {
  DEFAULT_SCORING_CONFIG,
  type ScoredDraft,
  type ScoredDraftWithScore,
} from "../../../src/feed/logic/scoring";
import {
  FIRST_SESSION_TOP_N,
  FIRST_SESSION_WINDOW_MS,
  QUALITY_DISTRIBUTION_BUCKETS,
  computeBookDepthReach,
  computePostTypeMix,
  computeQualityDistribution,
  firstSessionDocuments,
  summarizeGoalRelevance,
  type DocumentSessionInput,
} from "../../../src/feed/logic/servingAnalyticsMetrics";

const NOW = Date.now();

function scored(overrides: Partial<ScoredDraftWithScore> & { id: string }): ScoredDraftWithScore {
  return {
    id: overrides.id,
    documentId: overrides.documentId ?? "doc-1",
    sectionSummaryId: overrides.sectionSummaryId,
    postType: overrides.postType ?? "insight",
    strategy: overrides.strategy ?? "section",
    qualityScore: overrides.qualityScore ?? 0.8,
    semanticQualityScore: overrides.semanticQualityScore,
    sectionQualitySignal: overrides.sectionQualitySignal,
    servedCount: overrides.servedCount ?? 0,
    totalDraftsForDocument: overrides.totalDraftsForDocument ?? 10,
    documentCreatedAt: overrides.documentCreatedAt ?? NOW - 60 * 60 * 1000,
    chunkStartIndex: overrides.chunkStartIndex,
    documentChunkCount: overrides.documentChunkCount,
    score: overrides.score ?? 0.8,
  };
}

describe("firstSessionDocuments", () => {
  it("includes documents created within the 24h window with zero prior serves", () => {
    const topDrafts = [
      scored({ id: "d1", documentId: "doc-a" }),
      scored({ id: "d2", documentId: "doc-a" }),
    ];
    const inputs: DocumentSessionInput[] = [
      { documentId: "doc-a", documentCreatedAt: NOW - 60 * 60 * 1000, priorServedCount: 0 },
    ];
    const result = firstSessionDocuments({ topDrafts, documentInputs: inputs, now: NOW });
    expect(result).toHaveLength(1);
    expect(result[0]!.documentId).toBe("doc-a");
    expect(result[0]!.topDrafts).toHaveLength(2);
  });

  it("excludes documents older than 24h", () => {
    const topDrafts = [scored({ id: "d1", documentId: "doc-old" })];
    const inputs: DocumentSessionInput[] = [
      {
        documentId: "doc-old",
        documentCreatedAt: NOW - FIRST_SESSION_WINDOW_MS - 1,
        priorServedCount: 0,
      },
    ];
    const result = firstSessionDocuments({ topDrafts, documentInputs: inputs, now: NOW });
    expect(result).toHaveLength(0);
  });

  it("excludes documents that already had served drafts before this batch", () => {
    const topDrafts = [scored({ id: "d1", documentId: "doc-returning" })];
    const inputs: DocumentSessionInput[] = [
      {
        documentId: "doc-returning",
        documentCreatedAt: NOW - 60 * 60 * 1000,
        priorServedCount: 5,
      },
    ];
    const result = firstSessionDocuments({ topDrafts, documentInputs: inputs, now: NOW });
    expect(result).toHaveLength(0);
  });

  it("caps drafts per document at FIRST_SESSION_TOP_N", () => {
    const topDrafts = Array.from({ length: 15 }, (_, i) => scored({ id: `d-${i}` }));
    const inputs: DocumentSessionInput[] = [
      { documentId: "doc-1", documentCreatedAt: NOW - 60 * 60 * 1000, priorServedCount: 0 },
    ];
    const result = firstSessionDocuments({ topDrafts, documentInputs: inputs, now: NOW });
    expect(result[0]!.topDrafts).toHaveLength(FIRST_SESSION_TOP_N);
  });

  it("splits by document when a batch mixes first-session and returning docs", () => {
    const topDrafts = [
      scored({ id: "d1", documentId: "doc-first" }),
      scored({ id: "d2", documentId: "doc-returning" }),
    ];
    const inputs: DocumentSessionInput[] = [
      { documentId: "doc-first", documentCreatedAt: NOW - 60 * 60 * 1000, priorServedCount: 0 },
      { documentId: "doc-returning", documentCreatedAt: NOW - 60 * 60 * 1000, priorServedCount: 3 },
    ];
    const result = firstSessionDocuments({ topDrafts, documentInputs: inputs, now: NOW });
    expect(result.map((r) => r.documentId)).toEqual(["doc-first"]);
  });

  it("excludes documents whose input entry is missing (defensive)", () => {
    const topDrafts = [scored({ id: "d1", documentId: "doc-orphan" })];
    const result = firstSessionDocuments({ topDrafts, documentInputs: [], now: NOW });
    expect(result).toHaveLength(0);
  });
});

describe("computeBookDepthReach", () => {
  it("reports max/min/spread/quartile-count for a well-spread top-10", () => {
    const topDrafts = [
      scored({ id: "d0", chunkStartIndex: 0, documentChunkCount: 100 }),
      scored({ id: "d1", chunkStartIndex: 30, documentChunkCount: 100 }),
      scored({ id: "d2", chunkStartIndex: 55, documentChunkCount: 100 }),
      scored({ id: "d3", chunkStartIndex: 90, documentChunkCount: 100 }),
    ];
    const result = computeBookDepthReach({
      documentId: "doc-a",
      topDrafts,
      priorServedCount: 0,
      documentCreatedAt: NOW,
    });
    expect(result).not.toBeNull();
    expect(result!.postCount).toBe(4);
    expect(result!.minBookPosition).toBeCloseTo(0, 3);
    expect(result!.maxBookPosition).toBeCloseTo(0.9, 3);
    expect(result!.spreadBookPosition).toBeCloseTo(0.9, 3);
    expect(result!.populatedQuartiles).toBe(4);
  });

  it("returns null when no drafts have position metadata", () => {
    const result = computeBookDepthReach({
      documentId: "doc-a",
      topDrafts: [scored({ id: "d0" })],
      priorServedCount: 0,
      documentCreatedAt: NOW,
    });
    expect(result).toBeNull();
  });

  it("skips drafts lacking position but includes those that have it", () => {
    const topDrafts = [
      scored({ id: "d0", chunkStartIndex: 10, documentChunkCount: 100 }),
      scored({ id: "d1" }),
      scored({ id: "d2", chunkStartIndex: 80, documentChunkCount: 100 }),
    ];
    const result = computeBookDepthReach({
      documentId: "doc-a",
      topDrafts,
      priorServedCount: 0,
      documentCreatedAt: NOW,
    });
    expect(result).not.toBeNull();
    expect(result!.postCount).toBe(2);
    expect(result!.populatedQuartiles).toBe(2);
  });

  it("clamps chunkStartIndex >= documentChunkCount to the last quartile", () => {
    const topDrafts = [scored({ id: "edge", chunkStartIndex: 100, documentChunkCount: 100 })];
    const result = computeBookDepthReach({
      documentId: "doc-a",
      topDrafts,
      priorServedCount: 0,
      documentCreatedAt: NOW,
    });
    expect(result!.populatedQuartiles).toBe(1);
    expect(result!.maxBookPosition).toBe(1);
  });

  it("ignores drafts with documentChunkCount <= 0 (guard against divide-by-zero)", () => {
    const topDrafts = [
      scored({ id: "bad", chunkStartIndex: 5, documentChunkCount: 0 }),
      scored({ id: "good", chunkStartIndex: 10, documentChunkCount: 100 }),
    ];
    const result = computeBookDepthReach({
      documentId: "doc-a",
      topDrafts,
      priorServedCount: 0,
      documentCreatedAt: NOW,
    });
    expect(result).not.toBeNull();
    expect(result!.postCount).toBe(1);
  });
});

describe("computePostTypeMix", () => {
  it("returns a flat count record by post type", () => {
    const topDrafts = [
      scored({ id: "1", postType: "insight" }),
      scored({ id: "2", postType: "insight" }),
      scored({ id: "3", postType: "quote" }),
      scored({ id: "4", postType: "quiz" }),
      scored({ id: "5", postType: "quiz" }),
      scored({ id: "6", postType: "summary" }),
    ];
    const result = computePostTypeMix({
      documentId: "doc-a",
      topDrafts,
      priorServedCount: 0,
      documentCreatedAt: NOW,
    });
    expect(result.postCount).toBe(6);
    expect(result.mix).toEqual({ insight: 2, quote: 1, quiz: 2, summary: 1 });
  });

  it("returns an empty mix for empty input", () => {
    const result = computePostTypeMix({
      documentId: "doc-a",
      topDrafts: [],
      priorServedCount: 0,
      documentCreatedAt: NOW,
    });
    expect(result.postCount).toBe(0);
    expect(result.mix).toEqual({});
  });
});

describe("computeQualityDistribution", () => {
  function draft(overrides: Partial<ScoredDraft> & { id: string }): ScoredDraft {
    return {
      id: overrides.id,
      documentId: "doc-1",
      sectionSummaryId: overrides.sectionSummaryId,
      postType: overrides.postType ?? "insight",
      strategy: "section",
      qualityScore: overrides.qualityScore ?? 1.0,
      semanticQualityScore: overrides.semanticQualityScore,
      sectionQualitySignal: overrides.sectionQualitySignal,
      servedCount: 0,
      totalDraftsForDocument: 10,
      documentCreatedAt: NOW,
      chunkStartIndex: overrides.chunkStartIndex,
      documentChunkCount: overrides.documentChunkCount,
    };
  }

  it("returns null for empty input", () => {
    expect(computeQualityDistribution([])).toBeNull();
  });

  it("falls back to qualityScore when semanticQualityScore is missing (backward compat)", () => {
    const drafts = [draft({ id: "legacy", qualityScore: 0.5 })];
    const result = computeQualityDistribution(drafts)!;
    expect(result.mean).toBeCloseTo(0.5, 3);
  });

  it("blends 0.7*semantic + 0.3*section when both present", () => {
    const drafts = [draft({ id: "blended", semanticQualityScore: 0.8, sectionQualitySignal: 0.4 })];
    const result = computeQualityDistribution(drafts)!;
    expect(result.mean).toBeCloseTo(0.7 * 0.8 + 0.3 * 0.4, 3);
  });

  it("uses semantic alone when section signal is absent", () => {
    const drafts = [draft({ id: "sem-only", semanticQualityScore: 0.75 })];
    const result = computeQualityDistribution(drafts)!;
    expect(result.mean).toBeCloseTo(0.75, 3);
  });

  it("reports std, belowThreshold07Share, and bucket counts", () => {
    const drafts = [
      draft({ id: "a", semanticQualityScore: 0.15 }),
      draft({ id: "b", semanticQualityScore: 0.45 }),
      draft({ id: "c", semanticQualityScore: 0.65 }),
      draft({ id: "d", semanticQualityScore: 0.75 }),
      draft({ id: "e", semanticQualityScore: 0.95 }),
    ];
    const result = computeQualityDistribution(drafts)!;
    expect(result.totalPosts).toBe(5);
    expect(result.std).toBeGreaterThan(0.15);
    expect(result.belowThreshold07Share).toBeCloseTo(3 / 5, 3);
    // All 8 labels present (zeros included) so ops dashboards can plot stable axes.
    expect(Object.keys(result.buckets).sort()).toEqual(
      QUALITY_DISTRIBUTION_BUCKETS.map((b) => b.label).sort(),
    );
    expect(result.buckets["b_0_0_2"]).toBe(1);
    expect(result.buckets["b_0_4_0_5"]).toBe(1);
    expect(result.buckets["b_0_6_0_7"]).toBe(1);
    expect(result.buckets["b_0_7_0_8"]).toBe(1);
    expect(result.buckets["b_0_9_1_0"]).toBe(1);
  });

  it("places a quality of exactly 1.0 into the top bucket", () => {
    const drafts = [draft({ id: "top", semanticQualityScore: 1.0 })];
    const result = computeQualityDistribution(drafts)!;
    expect(result.buckets["b_0_9_1_0"]).toBe(1);
  });

  it("places values on bucket boundaries into the upper bucket (half-open intervals)", () => {
    const drafts = [draft({ id: "on-0_7", semanticQualityScore: 0.7 })];
    const result = computeQualityDistribution(drafts)!;
    expect(result.buckets["b_0_7_0_8"]).toBe(1);
    expect(result.buckets["b_0_6_0_7"]).toBe(0);
  });
});

describe("summarizeGoalRelevance", () => {
  const alpha = DEFAULT_SCORING_CONFIG.goalRelevanceAlpha;
  const floor = DEFAULT_SCORING_CONFIG.goalRelevanceFloor;

  it("reports applied=false when goal is absent", () => {
    const result = summarizeGoalRelevance({
      goalEmbeddingByDocument: undefined,
      topDrafts: [scored({ id: "a", sectionSummaryId: "s1" })],
      sectionEmbeddings: new Map([["s1", [1, 0]]]),
      candidateSectionIds: ["s1"],
      goalRelevanceAlpha: alpha,
      goalRelevanceFloor: floor,
    });
    expect(result.applied).toBe(false);
    expect(result.meanRelevanceBoost).toBe(0);
    expect(result.boostedPostCount).toBe(0);
    expect(result.sectionEmbeddingCoveragePercent).toBe(0);
  });

  it("reports applied=false when goal map is empty", () => {
    const result = summarizeGoalRelevance({
      goalEmbeddingByDocument: new Map(),
      topDrafts: [scored({ id: "a", sectionSummaryId: "s1" })],
      sectionEmbeddings: new Map([["s1", [1, 0]]]),
      candidateSectionIds: ["s1"],
      goalRelevanceAlpha: alpha,
      goalRelevanceFloor: floor,
    });
    expect(result.applied).toBe(false);
  });

  it("reports coverage = 1.0 when every candidate section has a usable vector", () => {
    const result = summarizeGoalRelevance({
      goalEmbeddingByDocument: new Map([["doc-1", [1, 0]]]),
      topDrafts: [
        scored({ id: "a", sectionSummaryId: "s1" }),
        scored({ id: "b", sectionSummaryId: "s2" }),
      ],
      sectionEmbeddings: new Map([
        ["s1", [1, 0]],
        ["s2", [0, 1]],
      ]),
      candidateSectionIds: ["s1", "s2"],
      goalRelevanceAlpha: alpha,
      goalRelevanceFloor: floor,
    });
    expect(result.applied).toBe(true);
    expect(result.sectionEmbeddingCoveragePercent).toBe(1);
  });

  it("reports degraded coverage when some candidate sections lack vectors (I3)", () => {
    const result = summarizeGoalRelevance({
      goalEmbeddingByDocument: new Map([["doc-1", [1, 0]]]),
      topDrafts: [scored({ id: "a", sectionSummaryId: "s1" })],
      sectionEmbeddings: new Map([["s1", [1, 0]]]),
      candidateSectionIds: ["s1", "s2", "s3", "s4"],
      goalRelevanceAlpha: alpha,
      goalRelevanceFloor: floor,
    });
    expect(result.applied).toBe(true);
    expect(result.sectionEmbeddingCoveragePercent).toBeCloseTo(0.25, 3);
  });

  it("treats mismatched vector dimensions as missing coverage", () => {
    const result = summarizeGoalRelevance({
      goalEmbeddingByDocument: new Map([["doc-1", [1, 0, 0]]]),
      topDrafts: [scored({ id: "a", sectionSummaryId: "s1" })],
      sectionEmbeddings: new Map([["s1", [1, 0]]]),
      candidateSectionIds: ["s1"],
      goalRelevanceAlpha: alpha,
      goalRelevanceFloor: floor,
    });
    expect(result.applied).toBe(true);
    expect(result.sectionEmbeddingCoveragePercent).toBe(0);
    expect(result.boostedPostCount).toBe(0);
  });

  it("reports meanRelevanceBoost matching the scorer's goalRelevance - 1 term", () => {
    const goalEmbeddingByDocument = new Map([["doc-1", [1, 0]]]);
    const sectionEmbeddings = new Map([
      ["s-aligned", [1, 0]],
      ["s-half", [1, 1]],
    ]);
    const topDrafts = [
      scored({ id: "a", sectionSummaryId: "s-aligned" }),
      scored({ id: "b", sectionSummaryId: "s-half" }),
    ];
    const result = summarizeGoalRelevance({
      goalEmbeddingByDocument,
      topDrafts,
      sectionEmbeddings,
      candidateSectionIds: ["s-aligned", "s-half"],
      goalRelevanceAlpha: alpha,
      goalRelevanceFloor: floor,
    });
    // aligned: cosine = 1.0 -> boost = 0.6 * 0.9 = 0.54
    // half: cosine = 1/sqrt(2) ~ 0.707 -> boost = 0.6 * (0.707 - 0.1) = 0.364
    const expectedMean = (0.54 + 0.6 * (Math.SQRT1_2 - 0.1)) / 2;
    expect(result.meanRelevanceBoost).toBeCloseTo(expectedMean, 2);
    expect(result.boostedPostCount).toBe(2);
  });

  it("ignores topDrafts without a sectionSummaryId (highlight/thematic)", () => {
    const result = summarizeGoalRelevance({
      goalEmbeddingByDocument: new Map([["doc-1", [1, 0]]]),
      topDrafts: [scored({ id: "no-section" })],
      sectionEmbeddings: new Map(),
      candidateSectionIds: [],
      goalRelevanceAlpha: alpha,
      goalRelevanceFloor: floor,
    });
    expect(result.applied).toBe(true);
    expect(result.meanRelevanceBoost).toBe(0);
    expect(result.boostedPostCount).toBe(0);
  });

  it("clamps boosts below the floor to zero", () => {
    const result = summarizeGoalRelevance({
      goalEmbeddingByDocument: new Map([["doc-1", [1, 0]]]),
      topDrafts: [scored({ id: "orthogonal", sectionSummaryId: "s-orth" })],
      sectionEmbeddings: new Map([["s-orth", [0, 1]]]),
      candidateSectionIds: ["s-orth"],
      goalRelevanceAlpha: alpha,
      goalRelevanceFloor: floor,
    });
    expect(result.boostedPostCount).toBe(0);
    expect(result.meanRelevanceBoost).toBe(0);
  });

  it("skips drafts whose document is not in the goal map", () => {
    const result = summarizeGoalRelevance({
      goalEmbeddingByDocument: new Map([["doc-with-goal", [1, 0]]]),
      topDrafts: [
        scored({ id: "covered", sectionSummaryId: "s1", documentId: "doc-with-goal" }),
        scored({ id: "uncovered", sectionSummaryId: "s2", documentId: "doc-no-goal" }),
      ],
      sectionEmbeddings: new Map([
        ["s1", [1, 0]],
        ["s2", [1, 0]],
      ]),
      candidateSectionIds: ["s1", "s2"],
      goalRelevanceAlpha: alpha,
      goalRelevanceFloor: floor,
    });
    expect(result.applied).toBe(true);
    expect(result.boostedPostCount).toBe(1);
  });
});
