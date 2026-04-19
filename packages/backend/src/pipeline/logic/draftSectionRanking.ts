import { ZERO_USAGE, type TokenUsage } from "../../providers/ai";
import type { DraftGenerationServiceContext } from "../../providers/types";

export type SectionDraftRankingInput = {
  sectionSummaryId: string;
  sectionTitle: string;
  summary: string;
  chunkCount: number;
  existingDraftCount: number;
};

export type SectionDraftRanking = {
  sectionSummaryId: string;
  qualitySignal: number;
  quoteCandidate: boolean;
};

export type RankSectionsForPlanningResult = {
  rankings: SectionDraftRanking[];
  usage: TokenUsage;
  error?: string;
};

export async function rankSectionsForPlanning(opts: {
  services: DraftGenerationServiceContext;
  documentTitle: string;
  language?: string;
  learningGoal?: string;
  sections: SectionDraftRankingInput[];
}): Promise<RankSectionsForPlanningResult> {
  if (!opts.services.ranker || opts.sections.length === 0) {
    return { rankings: [], usage: ZERO_USAGE };
  }

  try {
    return await opts.services.ranker.rankSections({
      documentTitle: opts.documentTitle,
      language: opts.language,
      learningGoal: opts.learningGoal,
      sections: opts.sections,
    });
  } catch (error) {
    return {
      rankings: [],
      usage: ZERO_USAGE,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
