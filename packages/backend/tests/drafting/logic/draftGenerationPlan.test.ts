import { describe, expect, it } from "vitest";

import {
  INITIAL_DRAFT_POOL_LIMIT,
  planDraftGeneration,
  type DraftPlanningSection,
} from "../../../src/drafting/logic/draftGenerationPlan";

function makeSection(overrides: Partial<DraftPlanningSection> = {}): DraftPlanningSection {
  const index = overrides.sectionSummaryId?.replace(/\D/g, "") || "0";
  return {
    sectionSummaryId: `section-${index}`,
    sectionTitle: `Dense Section ${index}`,
    summary:
      "This section explains a distributed system pattern because it shows concrete failure modes, operational tradeoffs, research findings, and numbered examples across production teams.",
    chunkStartIndex: 0,
    chunkEndIndex: 3,
    ...overrides,
  };
}

describe("planDraftGeneration", () => {
  it("caps long-document initial generation and makes draft counts non-uniform", () => {
    const sections = Array.from({ length: 120 }, (_, index) =>
      makeSection({
        sectionSummaryId: `section-${index}`,
        sectionTitle: index >= 96 ? `Low Value Section ${index}` : `Dense Section ${index}`,
        summary:
          index >= 96
            ? "A short connective section with no durable learning value."
            : `This section explains system behavior because it has pattern ${index}, concrete failure modes, research evidence, and operational tradeoffs.`,
        chunkStartIndex: index * 4,
        chunkEndIndex: index * 4 + (index < 24 ? 5 : 2),
        qualitySignal: index >= 96 ? 0.12 : index < 24 ? 0.95 : 0.68,
      }),
    );

    const plan = planDraftGeneration({ sections, mode: "initial" });

    expect(plan.totalDrafts).toBeLessThanOrEqual(INITIAL_DRAFT_POOL_LIMIT);
    expect(plan.zeroDraftSectionCount).toBeGreaterThanOrEqual(24);
    expect(plan.sectionsWithThreeOrMoreDrafts).toBeGreaterThanOrEqual(24);
  });

  it("keeps every strong section represented for a short dense document", () => {
    const sections = Array.from({ length: 8 }, (_, index) =>
      makeSection({
        sectionSummaryId: `section-${index}`,
        sectionTitle: `Important Concept ${index}`,
        chunkStartIndex: index,
        chunkEndIndex: index + 1,
        qualitySignal: 0.86,
      }),
    );

    const plan = planDraftGeneration({ sections, mode: "initial" });

    expect(plan.zeroDraftSectionCount).toBe(0);
    expect(plan.sections).toHaveLength(sections.length);
    expect(plan.sections.every((section) => section.postTypes.length >= 1)).toBe(true);
  });

  it("uses language-agnostic ranker scores for non-English sections", () => {
    const sections = [
      makeSection({
        sectionSummaryId: "section-0",
        sectionTitle: "Polowanie",
        summary:
          "Michael Zorc probuje sprowadzic Roberta Lewandowskiego, a kolejne wystepy zawodnika zmieniaja negocjacje transferowe i ryzyko finansowe Borussii.",
        qualitySignal: 0.9,
      }),
      makeSection({
        sectionSummaryId: "section-1",
        sectionTitle: "Nota redakcyjna",
        summary: "Krotka nota organizacyjna.",
        qualitySignal: 0.12,
      }),
    ];

    const plan = planDraftGeneration({ sections, mode: "initial" });

    expect(plan.sections.map((section) => section.sectionSummaryId)).toContain("section-0");
    expect(plan.sections.map((section) => section.sectionSummaryId)).not.toContain("section-1");
  });

  it("keeps quote drafts conditional and below the share limit", () => {
    const sections = Array.from({ length: 40 }, (_, index) =>
      makeSection({
        sectionSummaryId: `section-${index}`,
        sectionTitle: index < 20 ? `Interview Moment ${index}` : `Concept ${index}`,
        summary:
          index < 20
            ? "The author said this episode matters because it captures a specific quote, an interview claim, and a memorable warning with production consequences."
            : "This section explains a system pattern because it compares concrete examples, failure modes, and design tradeoffs.",
        chunkStartIndex: index,
        chunkEndIndex: index + 2,
        qualitySignal: 0.82,
        quoteCandidate: index < 20,
      }),
    );

    const plan = planDraftGeneration({ sections, mode: "initial" });

    expect(plan.quoteDraftCount).toBeLessThanOrEqual(Math.floor(plan.totalDrafts * 0.25));
    expect(
      plan.sections.filter((section) => section.postTypes.includes("quote")).length,
    ).toBeLessThan(sections.length);
  });

  it("prioritizes previously uncovered sections during replenishment", () => {
    const sections = Array.from({ length: 30 }, (_, index) =>
      makeSection({
        sectionSummaryId: `section-${index}`,
        existingDraftCount: index < 20 ? 0 : 2,
        chunkStartIndex: index,
        chunkEndIndex: index + 2,
        qualitySignal: 0.78,
      }),
    );

    const plan = planDraftGeneration({ sections, mode: "replenishment", maxDrafts: 30 });
    const uncoveredDrafts = plan.sections
      .filter((section) => Number(section.sectionSummaryId.replace("section-", "")) < 20)
      .reduce((sum, section) => sum + section.postTypes.length, 0);

    expect(uncoveredDrafts / plan.totalDrafts).toBeGreaterThanOrEqual(0.5);
  });
});
