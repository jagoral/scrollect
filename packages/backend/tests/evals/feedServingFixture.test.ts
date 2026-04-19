import { describe, expect, it } from "vitest";

import {
  DEFAULT_SCORING_CONFIG,
  scoreDrafts,
  type ScoredDraft,
} from "../../src/feed/logic/scoring";
import { DDIA_FIXTURE_GOAL_CLEARED, DDIA_FIXTURE_GOAL_SET } from "./fixtures/feedServing";
import type { FeedServingFixture } from "./fixtures/feedServing/types";
import { bookPositionOf } from "./fixtures/feedServing/types";

const FRONT_MATTER_THRESHOLD = DEFAULT_SCORING_CONFIG.frontMatterThreshold;

function runScoring(fixture: FeedServingFixture) {
  const now = Date.now();
  const poolSize = fixture.drafts.length;
  const drafts: ScoredDraft[] = fixture.drafts.map((d) => ({
    id: d.draftId,
    documentId: d.documentId,
    sectionSummaryId: d.sectionId,
    cardType: d.cardType,
    strategy: d.strategy,
    qualityScore: d.qualityScore,
    semanticQualityScore: d.semanticQualityScore,
    sectionQualitySignal: d.sectionQualitySignal,
    servedCount: 0,
    totalDraftsForDocument: poolSize,
    documentCreatedAt: now,
    chunkStartIndex: d.chunkStartIndex,
    documentChunkCount: fixture.documentChunkCount,
  }));
  return scoreDrafts({
    drafts,
    config: DEFAULT_SCORING_CONFIG,
    now,
    goalEmbedding: fixture.goalEmbedding,
    sectionEmbeddings: fixture.sectionEmbeddings,
  });
}

describe("DDIA feed-serving fixture", () => {
  it("produces a non-empty pool with varied semantic quality", () => {
    const pool = DDIA_FIXTURE_GOAL_SET.drafts;
    expect(pool.length).toBeGreaterThan(100);
    const scores = pool.map((d) => d.semanticQualityScore);
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const std = Math.sqrt(scores.reduce((acc, s) => acc + (s - mean) ** 2, 0) / scores.length);
    expect(std).toBeGreaterThanOrEqual(0.15);
    expect(scores.filter((s) => s < 0.7).length / scores.length).toBeGreaterThanOrEqual(0.2);
  });

  it("includes front matter (sectionQualitySignal < 0.3), over-represented quotes, and a non-English section", () => {
    const pool = DDIA_FIXTURE_GOAL_SET.drafts;
    expect(pool.some((d) => d.sectionQualitySignal < FRONT_MATTER_THRESHOLD)).toBe(true);
    const quoteShare = pool.filter((d) => d.cardType === "quote").length / pool.length;
    expect(quoteShare).toBeGreaterThanOrEqual(0.3);
    expect(pool.some((d) => d.language !== "en")).toBe(true);
  });

  it("clears the goal embedding when goal is not set", () => {
    expect(DDIA_FIXTURE_GOAL_CLEARED.goalEmbedding).toBeUndefined();
    expect(DDIA_FIXTURE_GOAL_CLEARED.learningGoal).toBe("");
  });

  it("provides section embeddings for every draft's section", () => {
    const fixture = DDIA_FIXTURE_GOAL_SET;
    const sectionIds = new Set(fixture.drafts.map((d) => d.sectionId));
    for (const id of sectionIds) {
      expect(fixture.sectionEmbeddings.has(id)).toBe(true);
      expect(fixture.sectionEmbeddings.get(id)!.length).toBeGreaterThan(0);
    }
  });

  it("production scoreDrafts spreads book depth across top 10", () => {
    const ranked = runScoring(DDIA_FIXTURE_GOAL_SET);
    const ratios = ranked
      .slice(0, 10)
      .map((r) =>
        bookPositionOf(
          { chunkStartIndex: r.chunkStartIndex! } as never,
          DDIA_FIXTURE_GOAL_SET.documentChunkCount,
        ),
      );
    const spread = Math.max(...ratios) - Math.min(...ratios);
    expect(spread).toBeGreaterThanOrEqual(0.5);
  });

  it("production scoreDrafts excludes front matter from top 20", () => {
    const ranked = runScoring(DDIA_FIXTURE_GOAL_SET);
    const offending = ranked
      .slice(0, 20)
      .filter(
        (r) =>
          r.sectionQualitySignal !== undefined && r.sectionQualitySignal < FRONT_MATTER_THRESHOLD,
      );
    expect(offending).toEqual([]);
  });

  it("production scoreDrafts produces different top-15 order with and without learning goal", () => {
    const withGoal = runScoring(DDIA_FIXTURE_GOAL_SET)
      .slice(0, 15)
      .map((r) => r.id)
      .join("|");
    const withoutGoal = runScoring(DDIA_FIXTURE_GOAL_CLEARED)
      .slice(0, 15)
      .map((r) => r.id)
      .join("|");
    expect(withGoal).not.toBe(withoutGoal);
  });

  // Regression guard: if someone swaps the ranker back to the pre-#216 behavior
  // (rank by saturated qualityScore alone, no book-position spread, no front-
  // matter penalty), the acceptance-criterion scorers MUST fail. Confirms the
  // scorers are actually sensitive, not just passing because the fixture
  // happens to be well-shaped.
  it("naive qualityScore ranker fails the acceptance criteria", () => {
    const naive = [...DDIA_FIXTURE_GOAL_SET.drafts].sort((a, b) => b.qualityScore - a.qualityScore);
    const top10 = naive.slice(0, 10);
    const top20 = naive.slice(0, 20);
    const ratios = top10.map((d) => bookPositionOf(d, DDIA_FIXTURE_GOAL_SET.documentChunkCount));
    const spread = Math.max(...ratios) - Math.min(...ratios);
    const frontMatterCount = top20.filter(
      (d) => d.sectionQualitySignal < FRONT_MATTER_THRESHOLD,
    ).length;
    const quoteShare = top20.filter((d) => d.cardType === "quote").length / top20.length;
    // At least one acceptance criterion is violated by the naive ranker.
    expect(frontMatterCount > 0 || spread < 0.5 || quoteShare > 0.3).toBe(true);
  });
});
