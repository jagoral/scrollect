import { createScorer, evalite } from "evalite";

import { DEFAULT_SCORING_CONFIG, scoreDrafts, type ScoredDraft } from "../src/feed/logic/scoring";
import {
  DDIA_FIXTURE_GOAL_CLEARED,
  DDIA_FIXTURE_GOAL_SET,
} from "../tests/evals/fixtures/feedServing";
import type { FeedServingFixture, FixtureDraft } from "../tests/evals/fixtures/feedServing/types";
import { bookPositionOf } from "../tests/evals/fixtures/feedServing/types";

const FRONT_MATTER_THRESHOLD = DEFAULT_SCORING_CONFIG.frontMatterThreshold;

type ServingEvalInput = {
  fixture: FeedServingFixture;
  /** Companion fixture with the learning goal cleared. Used by the goal-differential scorer. */
  goalClearedFixture?: FeedServingFixture;
};

type ServingEvalOutput = {
  fixture: FeedServingFixture;
  ranked: FixtureDraft[];
  pool: FixtureDraft[];
  rankedWithoutGoal?: FixtureDraft[];
};

/**
 * Maps the fixture's draft rows onto the production `ScoredDraft` shape and calls the
 * real `scoreDrafts` from `src/feed/logic/scoring.ts`. Safe defaults for fields that
 * don't apply to a fresh-upload eval scenario:
 *  - `servedCount = 0` (no prior serves in the harness).
 *  - `totalDraftsForDocument` = pool size (single-document fixture today).
 *  - `documentCreatedAt` = `now` (new-upload recency path).
 *  - `strategy = "initial"` (no highlight-boost drafts in the fixture).
 * The fixture's `sectionId` maps 1:1 to `ScoredDraft.sectionSummaryId`, which is the
 * key scoring.ts uses to look up `sectionEmbeddings`.
 */
function runRanking(fixture: FeedServingFixture): FixtureDraft[] {
  const now = Date.now();
  const poolSize = fixture.drafts.length;
  const draftById = new Map<string, FixtureDraft>(fixture.drafts.map((d) => [d.draftId, d]));

  const scoringInput: ScoredDraft[] = fixture.drafts.map((d) => ({
    id: d.draftId,
    documentId: d.documentId,
    sectionSummaryId: d.sectionId,
    postType: d.postType,
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

  const goalEmbeddingByDocument = fixture.goalEmbedding
    ? new Map(fixture.drafts.map((d) => [d.documentId, fixture.goalEmbedding!]))
    : undefined;
  const ranked = scoreDrafts({
    drafts: scoringInput,
    config: DEFAULT_SCORING_CONFIG,
    now,
    goalEmbeddingByDocument,
    sectionEmbeddings: fixture.sectionEmbeddings,
  });

  // Project back to the fixture-draft rows so scorers can assert on fixture-level fields
  // (language, sectionTitle, postType, bookPositionRatio, etc.) without duplicating them
  // on ScoredDraft.
  return ranked.map((r) => draftById.get(r.id)!).filter((d): d is FixtureDraft => !!d);
}

const firstSessionBookDepth = createScorer<ServingEvalInput, ServingEvalOutput, unknown>({
  name: "First Session Book Depth",
  description: "Top-10 served posts span at least 50% of book-position range.",
  scorer: ({ output }) => {
    const topTen = output.ranked.slice(0, 10);
    if (topTen.length === 0) return { score: 0, metadata: { reason: "empty pool" } };
    const ratios = topTen.map((d) => bookPositionOf(d, output.fixture.documentChunkCount));
    const spread = Math.max(...ratios) - Math.min(...ratios);
    return {
      score: spread >= 0.5 ? 1 : 0,
      metadata: { spread, minRatio: Math.min(...ratios), maxRatio: Math.max(...ratios) },
    };
  },
});

const noFrontMatterInTop20 = createScorer<ServingEvalInput, ServingEvalOutput, unknown>({
  name: "No Front Matter In Top 20",
  description:
    "No drafts with `sectionQualitySignal < 0.3` appear in the first 20 served posts. Language-agnostic.",
  scorer: ({ output }) => {
    const topTwenty = output.ranked.slice(0, 20);
    const frontMatter = topTwenty.filter((d) => d.sectionQualitySignal < FRONT_MATTER_THRESHOLD);
    return {
      score: frontMatter.length === 0 ? 1 : 0,
      metadata: {
        frontMatterCount: frontMatter.length,
        offendingTitles: frontMatter.map((d) => d.sectionTitle),
      },
    };
  },
});

const quoteShareTop20 = createScorer<ServingEvalInput, ServingEvalOutput, unknown>({
  name: "Quote Share Top 20",
  description: "`postType === 'quote'` share is <= 30% of the first 20 served posts.",
  scorer: ({ output }) => {
    const topTwenty = output.ranked.slice(0, 20);
    if (topTwenty.length === 0) return { score: 0, metadata: { reason: "empty pool" } };
    const quoteCount = topTwenty.filter((d) => d.postType === "quote").length;
    const quoteShare = quoteCount / topTwenty.length;
    return {
      score: quoteShare <= 0.3 ? 1 : 0,
      metadata: { quoteCount, quoteShare },
    };
  },
});

const servingQualityDistribution = createScorer<ServingEvalInput, ServingEvalOutput, unknown>({
  name: "Serving Quality Distribution",
  description:
    "Semantic quality across the pool has real spread: std >= 0.15 AND >= 20% of drafts below 0.7.",
  scorer: ({ output }) => {
    const scores = output.pool.map((d) => d.semanticQualityScore);
    if (scores.length === 0) return { score: 0, metadata: { reason: "empty pool" } };
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const variance = scores.reduce((acc, s) => acc + (s - mean) ** 2, 0) / scores.length;
    const std = Math.sqrt(variance);
    const belowThresholdShare = scores.filter((s) => s < 0.7).length / scores.length;
    const stdOk = std >= 0.15;
    const thresholdOk = belowThresholdShare >= 0.2;
    return {
      score: stdOk && thresholdOk ? 1 : 0,
      metadata: { std, mean, belowThresholdShare },
    };
  },
});

const learningGoalDifferential = createScorer<ServingEvalInput, ServingEvalOutput, unknown>({
  name: "Learning Goal Differential",
  description:
    "Top-15 rank order differs between goal-set and goal-cleared runs over the same pool.",
  scorer: ({ output }) => {
    if (!output.rankedWithoutGoal) {
      return { score: 1, metadata: { reason: "not applicable (goal-cleared case)" } };
    }
    const topGoal = output.ranked
      .slice(0, 15)
      .map((d) => d.draftId)
      .join("|");
    const topCleared = output.rankedWithoutGoal
      .slice(0, 15)
      .map((d) => d.draftId)
      .join("|");
    return {
      score: topGoal !== topCleared ? 1 : 0,
      metadata: { topGoal, topCleared },
    };
  },
});

const nonEnglishSafe = createScorer<ServingEvalInput, ServingEvalOutput, unknown>({
  name: "Non-English Safe",
  description:
    "A strong-signal non-English section ranks competitively - inside the top half of served results.",
  scorer: ({ output }) => {
    const nonEnglishIndex = output.ranked.findIndex((d) => d.language !== "en");
    if (nonEnglishIndex === -1) {
      return { score: 0, metadata: { reason: "no non-English draft in pool" } };
    }
    const median = Math.floor(output.ranked.length / 2);
    return {
      score: nonEnglishIndex <= median ? 1 : 0,
      metadata: { nonEnglishIndex, median, poolSize: output.ranked.length },
    };
  },
});

evalite("Feed Serving Ranking", {
  data: () => [
    {
      input: {
        fixture: DDIA_FIXTURE_GOAL_SET,
        goalClearedFixture: DDIA_FIXTURE_GOAL_CLEARED,
      } satisfies ServingEvalInput,
    },
    {
      input: {
        fixture: DDIA_FIXTURE_GOAL_CLEARED,
      } satisfies ServingEvalInput,
    },
  ],
  task: async (input) => {
    const ranked = runRanking(input.fixture);
    const rankedWithoutGoal = input.goalClearedFixture
      ? runRanking(input.goalClearedFixture)
      : undefined;
    return {
      fixture: input.fixture,
      ranked,
      pool: input.fixture.drafts,
      rankedWithoutGoal,
    } satisfies ServingEvalOutput;
  },
  scorers: [
    firstSessionBookDepth,
    noFrontMatterInTop20,
    quoteShareTop20,
    servingQualityDistribution,
    learningGoalDifferential,
    nonEnglishSafe,
  ],
  trialCount: 1,
});
