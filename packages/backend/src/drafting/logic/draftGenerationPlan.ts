import type { DraftPostType } from "../../providers/types";

export const INITIAL_DRAFT_POOL_LIMIT = 150;
export const REPLENISHMENT_DRAFT_POOL_LIMIT = 60;

const MIN_INITIAL_QUALITY_SCORE = 0.38;
const MIN_REPLENISHMENT_QUALITY_SCORE = 0.32;
const LONG_DOCUMENT_SECTION_COUNT = 50;
const LONG_DOCUMENT_TARGET_COVERAGE = 0.75;
const TOP_SECTION_SHARE = 0.2;
const QUOTE_SHARE_LIMIT = 0.25;

type GenerationMode = "initial" | "replenishment";
type AllocationStrategy = (opts: {
  sections: ScoredSection[];
  maxDrafts: number;
}) => CountedSection[];

type DraftPlanningPolicy = {
  maxDrafts: number;
  defaultGenerationBatch: number;
  allocateDraftCounts: AllocationStrategy;
};

export type DraftPlanningSection = {
  sectionSummaryId: string;
  sectionTitle: string;
  summary: string;
  chunkStartIndex: number;
  chunkEndIndex: number;
  existingDraftCount?: number;
  qualitySignal?: number;
  quoteCandidate?: boolean;
};

export type PlannedSectionDrafts = {
  sectionSummaryId: string;
  cardTypes: DraftPostType[];
  generationBatch: number;
  qualitySignal: number;
  quoteCandidate: boolean;
  wasPreviouslyUncovered: boolean;
};

export type DraftGenerationPlan = {
  sections: PlannedSectionDrafts[];
  totalDrafts: number;
  zeroDraftSectionCount: number;
  sectionsWithThreeOrMoreDrafts: number;
  quoteDraftCount: number;
  previouslyUncoveredDraftShare: number;
};

type ScoredSection = DraftPlanningSection & {
  chunkCount: number;
  qualitySignal: number;
  quoteCandidate: boolean;
};

type CountedSection = ScoredSection & {
  draftCount: number;
};

const DRAFT_PLANNING_POLICIES = {
  initial: {
    maxDrafts: INITIAL_DRAFT_POOL_LIMIT,
    defaultGenerationBatch: 1,
    allocateDraftCounts: allocateInitialDraftCounts,
  },
  replenishment: {
    maxDrafts: REPLENISHMENT_DRAFT_POOL_LIMIT,
    defaultGenerationBatch: 2,
    allocateDraftCounts: allocateReplenishmentDraftCounts,
  },
} satisfies Record<GenerationMode, DraftPlanningPolicy>;

const CARD_TYPES_BY_DRAFT_COUNT = {
  one: ["insight"],
  two: {
    default: ["insight", "summary"],
    quote: ["insight", "quote"],
  },
  three: {
    default: ["insight", "summary", "quiz"],
    quote: ["insight", "summary", "quote"],
  },
  four: {
    default: ["insight", "summary", "quiz"],
    quote: ["insight", "summary", "quiz", "quote"],
  },
} satisfies {
  one: DraftPostType[];
  two: Record<"default" | "quote", DraftPostType[]>;
  three: Record<"default" | "quote", DraftPostType[]>;
  four: Record<"default" | "quote", DraftPostType[]>;
};

export function planDraftGeneration(opts: {
  sections: DraftPlanningSection[];
  mode: GenerationMode;
  maxDrafts?: number;
  generationBatch?: number;
}): DraftGenerationPlan {
  const policy = DRAFT_PLANNING_POLICIES[opts.mode];
  const scoredSections = opts.sections.map(scoreSection);
  const countedSections = policy.allocateDraftCounts({
    sections: scoredSections,
    maxDrafts: opts.maxDrafts ?? policy.maxDrafts,
  });

  const plannedSections = assignCardTypes({
    sections: countedSections,
    generationBatch: opts.generationBatch ?? policy.defaultGenerationBatch,
  });

  return summarizePlan({ plannedSections, totalSectionCount: opts.sections.length });
}

export function scoreSection(section: DraftPlanningSection): ScoredSection {
  const chunkCount = Math.max(1, section.chunkEndIndex - section.chunkStartIndex + 1);
  const text = `${section.sectionTitle} ${section.summary}`;
  const words = text.split(/\s+/).filter(Boolean);
  const numberCount = (text.match(/\b\d+(?:[.,]\d+)?%?\b/g) ?? []).length;
  const sentenceCount = text.split(/[.!?。！？]/).filter((sentence) => sentence.trim()).length;
  const averageWordLength =
    words.length === 0 ? 0 : words.reduce((sum, word) => sum + word.length, 0) / words.length;

  const fallbackSignal = clamp(
    0.16 +
      Math.min(1, section.summary.length / 300) * 0.34 +
      Math.min(1, chunkCount / 4) * 0.22 +
      Math.min(1, numberCount / 3) * 0.12 +
      Math.min(1, sentenceCount / 4) * 0.1 +
      Math.min(1, averageWordLength / 10) * 0.06,
  );
  const qualitySignal =
    typeof section.qualitySignal === "number" ? clamp(section.qualitySignal) : fallbackSignal;

  return {
    ...section,
    chunkCount,
    qualitySignal,
    quoteCandidate:
      typeof section.quoteCandidate === "boolean"
        ? section.quoteCandidate
        : isQuoteCandidate({ section, qualitySignal }),
  };
}

function allocateInitialDraftCounts(opts: {
  sections: ScoredSection[];
  maxDrafts: number;
}): CountedSection[] {
  const { sections, maxDrafts } = opts;
  const scored = sections
    .filter((section) => section.qualitySignal >= MIN_INITIAL_QUALITY_SCORE)
    .sort(sortByQuality);
  const isShortDenseDocument =
    sections.reduce((sum, section) => sum + section.chunkCount, 0) < LONG_DOCUMENT_SECTION_COUNT;

  if (isShortDenseDocument) {
    return allocateShortDenseDraftCounts({ sections: scored, maxDrafts });
  }

  const topSectionCount = Math.ceil(sections.length * TOP_SECTION_SHARE);
  const maxCoveredSections = Math.max(
    1,
    Math.floor(sections.length * LONG_DOCUMENT_TARGET_COVERAGE),
  );
  const selected = scored.slice(0, maxCoveredSections);
  const counted: CountedSection[] = [];
  let remaining = maxDrafts;

  for (const [index, section] of selected.entries()) {
    if (remaining <= 0) break;
    const requested = index < topSectionCount ? 3 : section.qualitySignal >= 0.72 ? 2 : 1;
    const draftCount = Math.min(requested, remaining);
    counted.push({ ...section, draftCount });
    remaining -= draftCount;
  }

  return counted;
}

function allocateShortDenseDraftCounts(opts: {
  sections: ScoredSection[];
  maxDrafts: number;
}): CountedSection[] {
  const counted: CountedSection[] = [];
  let remaining = opts.maxDrafts;

  for (const [index, section] of opts.sections.entries()) {
    if (remaining <= 0) break;
    const requested = index < Math.ceil(opts.sections.length * TOP_SECTION_SHARE) ? 3 : 1;
    const draftCount = Math.min(requested, remaining);
    counted.push({ ...section, draftCount });
    remaining -= draftCount;
  }

  return counted;
}

function allocateReplenishmentDraftCounts(opts: {
  sections: ScoredSection[];
  maxDrafts: number;
}): CountedSection[] {
  const candidates = opts.sections
    .filter((section) => section.qualitySignal >= MIN_REPLENISHMENT_QUALITY_SCORE)
    .sort((a, b) => {
      const coverageDelta = (a.existingDraftCount ?? 0) - (b.existingDraftCount ?? 0);
      return coverageDelta === 0 ? sortByQuality(a, b) : coverageDelta;
    });

  const counted: CountedSection[] = [];
  let remaining = opts.maxDrafts;

  for (const section of candidates) {
    if (remaining <= 0) break;
    const existingDraftCount = section.existingDraftCount ?? 0;
    if (existingDraftCount >= 3) continue;

    const requested = existingDraftCount === 0 ? 2 : 1;
    const draftCount = Math.min(requested, remaining);
    counted.push({ ...section, draftCount });
    remaining -= draftCount;
  }

  return counted;
}

function assignCardTypes(opts: {
  sections: CountedSection[];
  generationBatch: number;
}): PlannedSectionDrafts[] {
  const totalDrafts = opts.sections.reduce((sum, section) => sum + section.draftCount, 0);
  let remainingQuotes = Math.floor(totalDrafts * QUOTE_SHARE_LIMIT);

  return opts.sections.map((section) => {
    const includeQuote = section.quoteCandidate && section.draftCount >= 2 && remainingQuotes > 0;
    if (includeQuote) remainingQuotes--;

    return {
      sectionSummaryId: section.sectionSummaryId,
      cardTypes: selectCardTypes({ draftCount: section.draftCount, includeQuote }),
      generationBatch: opts.generationBatch,
      qualitySignal: section.qualitySignal,
      quoteCandidate: section.quoteCandidate,
      wasPreviouslyUncovered: (section.existingDraftCount ?? 0) === 0,
    };
  });
}

function selectCardTypes(opts: { draftCount: number; includeQuote: boolean }): DraftPostType[] {
  if (opts.draftCount <= 0) return [];
  if (opts.draftCount === 1) return [...CARD_TYPES_BY_DRAFT_COUNT.one];

  const variant = opts.includeQuote ? "quote" : "default";
  if (opts.draftCount === 2) return [...CARD_TYPES_BY_DRAFT_COUNT.two[variant]];
  if (opts.draftCount === 3) return [...CARD_TYPES_BY_DRAFT_COUNT.three[variant]];
  return [...CARD_TYPES_BY_DRAFT_COUNT.four[variant]];
}

function summarizePlan(opts: {
  plannedSections: PlannedSectionDrafts[];
  totalSectionCount: number;
}): DraftGenerationPlan {
  const totalDrafts = opts.plannedSections.reduce(
    (sum, section) => sum + section.cardTypes.length,
    0,
  );
  const quoteDraftCount = opts.plannedSections.reduce(
    (sum, section) => sum + section.cardTypes.filter((type) => type === "quote").length,
    0,
  );
  const previouslyUncoveredDrafts = opts.plannedSections.reduce(
    (sum, section) => sum + (section.wasPreviouslyUncovered ? section.cardTypes.length : 0),
    0,
  );

  return {
    sections: opts.plannedSections,
    totalDrafts,
    zeroDraftSectionCount: opts.totalSectionCount - opts.plannedSections.length,
    sectionsWithThreeOrMoreDrafts: opts.plannedSections.filter(
      (section) => section.cardTypes.length >= 3,
    ).length,
    quoteDraftCount,
    previouslyUncoveredDraftShare: totalDrafts === 0 ? 0 : previouslyUncoveredDrafts / totalDrafts,
  };
}

function isQuoteCandidate(opts: { section: DraftPlanningSection; qualitySignal: number }): boolean {
  if (opts.qualitySignal < 0.65) return false;

  const text = `${opts.section.sectionTitle} ${opts.section.summary}`;
  return /["'`:\u2018\u2019\u201c\u201d\u201e\u00ab\u00bb]/.test(text);
}

function sortByQuality(a: ScoredSection, b: ScoredSection): number {
  if (b.qualitySignal !== a.qualitySignal) return b.qualitySignal - a.qualitySignal;
  return b.chunkCount - a.chunkCount;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}
