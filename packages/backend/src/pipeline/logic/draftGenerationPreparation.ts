import type { DraftPlanningSection } from "./draftGenerationPlan";
import type { SectionDraftRanking } from "./draftSectionRanking";

export type DraftPlanningCandidate = {
  sectionSummaryId: string;
  sectionTitle: string;
  summary: string;
  chunkStartIndex: number;
  chunkEndIndex: number;
};

export type ExistingDraftSnapshot = {
  sectionSummaryId?: string;
  generationBatch: number;
};

export function countDraftsBySection(drafts: ExistingDraftSnapshot[]): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const draft of drafts) {
    if (!draft.sectionSummaryId) continue;
    counts.set(draft.sectionSummaryId, (counts.get(draft.sectionSummaryId) ?? 0) + 1);
  }
  return counts;
}

export function getNextGenerationBatch(drafts: ExistingDraftSnapshot[]): number {
  return drafts.reduce((max, draft) => Math.max(max, draft.generationBatch), 0) + 1;
}

export function buildDraftPlanningSections(opts: {
  sections: DraftPlanningCandidate[];
  existingDraftCountBySection: ReadonlyMap<string, number>;
  rankings: SectionDraftRanking[];
}): DraftPlanningSection[] {
  const rankingsBySection = new Map(
    opts.rankings.map((ranking) => [ranking.sectionSummaryId, ranking]),
  );

  return opts.sections.map((section) => {
    const ranking = rankingsBySection.get(section.sectionSummaryId);
    return {
      ...section,
      existingDraftCount: opts.existingDraftCountBySection.get(section.sectionSummaryId) ?? 0,
      qualitySignal: ranking?.qualitySignal,
      quoteCandidate: ranking?.quoteCandidate,
    };
  });
}
