import { createScorer, evalite } from "evalite";

import {
  planDraftGeneration,
  type DraftPlanningSection,
} from "../src/drafting/logic/draftGenerationPlan";

type PlanningInput = {
  mode: "initial" | "replenishment";
  sections: DraftPlanningSection[];
  maxDrafts?: number;
  expected: PlanningExpected;
};

type PlanningExpected = {
  maxDrafts: number;
  minZeroDraftSections?: number;
  minThreeDraftSections?: number;
  maxQuoteShare?: number;
  minReplenishmentDepth?: number;
};

type PlanningOutput = ReturnType<typeof planDraftGeneration> & {
  expected: PlanningExpected;
};

function makeSection(overrides: Partial<DraftPlanningSection>): DraftPlanningSection {
  return {
    sectionSummaryId: "section-0",
    sectionTitle: "Section",
    summary: "Dense section summary with concrete details, examples, and consequences.",
    chunkStartIndex: 0,
    chunkEndIndex: 2,
    qualitySignal: 0.8,
    ...overrides,
  };
}

const budgetScorer = createScorer<PlanningInput, PlanningOutput, unknown>({
  name: "Draft Budget",
  description: "Generated draft count stays within the configured budget",
  scorer: ({ output }) => ({
    score: output.totalDrafts <= output.expected.maxDrafts ? 1 : 0,
    metadata: { totalDrafts: output.totalDrafts, maxDrafts: output.expected.maxDrafts },
  }),
});

const distributionScorer = createScorer<PlanningInput, PlanningOutput, unknown>({
  name: "Non Uniform Distribution",
  description: "Long initial plans leave weak sections empty and give top sections 3+ drafts",
  scorer: ({ output }) => {
    const zeroOk =
      output.expected.minZeroDraftSections === undefined ||
      output.zeroDraftSectionCount >= output.expected.minZeroDraftSections;
    const threeOk =
      output.expected.minThreeDraftSections === undefined ||
      output.sectionsWithThreeOrMoreDrafts >= output.expected.minThreeDraftSections;
    return {
      score: zeroOk && threeOk ? 1 : 0,
      metadata: {
        zeroDraftSectionCount: output.zeroDraftSectionCount,
        sectionsWithThreeOrMoreDrafts: output.sectionsWithThreeOrMoreDrafts,
      },
    };
  },
});

const quoteShareScorer = createScorer<PlanningInput, PlanningOutput, unknown>({
  name: "Conditional Quote Share",
  description: "Quote drafts stay below the configured share limit",
  scorer: ({ output }) => {
    const quoteShare = output.totalDrafts === 0 ? 0 : output.quoteDraftCount / output.totalDrafts;
    const maxQuoteShare = output.expected.maxQuoteShare ?? 1;
    return {
      score: quoteShare <= maxQuoteShare ? 1 : 0,
      metadata: { quoteShare, quoteDraftCount: output.quoteDraftCount },
    };
  },
});

const replenishmentScorer = createScorer<PlanningInput, PlanningOutput, unknown>({
  name: "Replenishment Depth",
  description: "Replenishment prefers sections that have not been covered yet",
  scorer: ({ output }) => {
    const minDepth = output.expected.minReplenishmentDepth;
    if (minDepth === undefined) return { score: 1 };
    return {
      score: output.previouslyUncoveredDraftShare >= minDepth ? 1 : 0,
      metadata: { previouslyUncoveredDraftShare: output.previouslyUncoveredDraftShare },
    };
  },
});

evalite("Draft Planning", {
  data: () => [
    {
      input: {
        mode: "initial",
        sections: Array.from({ length: 100 }, (_, index) =>
          makeSection({
            sectionSummaryId: `section-${index}`,
            qualitySignal: index < 20 ? 0.95 : index < 80 ? 0.64 : 0.12,
            quoteCandidate: index < 10,
          }),
        ),
        expected: {
          maxDrafts: 150,
          minZeroDraftSections: 20,
          minThreeDraftSections: 20,
          maxQuoteShare: 0.25,
        },
      } satisfies PlanningInput,
    },
    {
      input: {
        mode: "replenishment",
        maxDrafts: 30,
        sections: Array.from({ length: 30 }, (_, index) =>
          makeSection({
            sectionSummaryId: `section-${index}`,
            existingDraftCount: index < 18 ? 0 : 2,
            qualitySignal: 0.8,
          }),
        ),
        expected: { maxDrafts: 30, minReplenishmentDepth: 0.5 },
      } satisfies PlanningInput,
    },
  ],
  task: async (input) => ({
    ...planDraftGeneration({
      sections: input.sections,
      mode: input.mode,
      maxDrafts: input.maxDrafts,
    }),
    expected: input.expected,
  }),
  scorers: [budgetScorer, distributionScorer, quoteShareScorer, replenishmentScorer],
  trialCount: 1,
});
