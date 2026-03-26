import {
  computeRecencyBoost,
  HIGHLIGHT_BOOST,
  MAX_CONSECUTIVE_SAME_TYPE,
  REACTION_ALREADY_KNOW_MULTIPLIER,
  REACTION_LIKE_CARD_TYPE_MULTIPLIER,
  REACTION_LIKE_SECTION_MULTIPLIER,
  REACTION_NOT_INTERESTING_MULTIPLIER,
  REACTION_WRONG_TYPE_MULTIPLIER,
} from "./constants";

export type ScoringConfig = {
  highlightBoost: number;
  maxConsecutiveSameType: number;
  documentDiversityCap: number;
  batchSize: number;
  replenishmentThreshold: number;
  reactionNotInterestingMultiplier: number;
  reactionAlreadyKnowMultiplier: number;
  reactionWrongTypeMultiplier: number;
  reactionLikeSectionMultiplier: number;
  reactionLikeCardTypeMultiplier: number;
};

export const DEFAULT_SCORING_CONFIG: ScoringConfig = {
  highlightBoost: HIGHLIGHT_BOOST,
  maxConsecutiveSameType: MAX_CONSECUTIVE_SAME_TYPE,
  documentDiversityCap: 0.4,
  batchSize: 15,
  replenishmentThreshold: 10,
  reactionNotInterestingMultiplier: REACTION_NOT_INTERESTING_MULTIPLIER,
  reactionAlreadyKnowMultiplier: REACTION_ALREADY_KNOW_MULTIPLIER,
  reactionWrongTypeMultiplier: REACTION_WRONG_TYPE_MULTIPLIER,
  reactionLikeSectionMultiplier: REACTION_LIKE_SECTION_MULTIPLIER,
  reactionLikeCardTypeMultiplier: REACTION_LIKE_CARD_TYPE_MULTIPLIER,
};

export type ScoredDraft = {
  id: string;
  documentId: string;
  sectionSummaryId?: string;
  cardType: string;
  strategy: string;
  qualityScore: number;
  servedCount: number;
  totalDraftsForDocument: number;
  documentCreatedAt: number;
};

export type ScoredDraftWithScore = ScoredDraft & { score: number };

export type DislikeSignal = "not_interesting" | "already_know";

export type ReactionSummary = {
  dislikedSections: Map<string, DislikeSignal>;
  dislikedCardTypes: Set<string>;
  likedSections: Set<string>;
  likedCardTypes: Set<string>;
  rejectedDraftIds: Set<string>;
};

export function scoreDrafts(opts: {
  drafts: ScoredDraft[];
  config: ScoringConfig;
  now: number;
  reactionSummary?: ReactionSummary;
}): ScoredDraftWithScore[] {
  const { drafts, config, now, reactionSummary } = opts;

  const eligibleDrafts = reactionSummary
    ? drafts.filter((d) => !reactionSummary.rejectedDraftIds.has(d.id))
    : drafts;

  const scored = eligibleDrafts.map((draft) => {
    const recencyBoost = computeRecencyBoost(draft.documentCreatedAt, now);
    const highlightMultiplier = draft.strategy === "highlight" ? config.highlightBoost : 1.0;
    const saturationPenalty = 1 / (1 + draft.servedCount / draft.totalDraftsForDocument);
    const reactionMultiplier = reactionSummary
      ? computeReactionMultiplier(draft, reactionSummary, config)
      : 1.0;
    const score =
      draft.qualityScore *
      recencyBoost *
      highlightMultiplier *
      saturationPenalty *
      reactionMultiplier;
    return { ...draft, score };
  });

  scored.sort((a, b) => b.score - a.score);

  const reordered = applyTypeDiversity(scored, config.maxConsecutiveSameType);
  return applyDocumentDiversity(reordered, config);
}

function computeReactionMultiplier(
  draft: ScoredDraft,
  summary: ReactionSummary,
  config: ScoringConfig,
): number {
  let multiplier = 1.0;

  if (draft.sectionSummaryId) {
    const sectionSignal = summary.dislikedSections.get(draft.sectionSummaryId);
    if (sectionSignal === "not_interesting") {
      multiplier *= config.reactionNotInterestingMultiplier;
    } else if (sectionSignal === "already_know") {
      multiplier *= config.reactionAlreadyKnowMultiplier;
    }

    if (summary.likedSections.has(draft.sectionSummaryId)) {
      multiplier *= config.reactionLikeSectionMultiplier;
    }
  }

  if (summary.dislikedCardTypes.has(draft.cardType)) {
    multiplier *= config.reactionWrongTypeMultiplier;
  }

  if (summary.likedCardTypes.has(draft.cardType)) {
    multiplier *= config.reactionLikeCardTypeMultiplier;
  }

  return multiplier;
}

function applyTypeDiversity(
  sorted: ScoredDraftWithScore[],
  maxConsecutive: number,
): ScoredDraftWithScore[] {
  const result: ScoredDraftWithScore[] = [];
  const remaining = [...sorted];

  while (remaining.length > 0) {
    const consecutiveCount = countTrailingType(result);

    if (consecutiveCount < maxConsecutive) {
      result.push(remaining.shift()!);
      continue;
    }

    const lastType = result[result.length - 1]!.cardType;
    const swapIndex = remaining.findIndex((d) => d.cardType !== lastType);

    if (swapIndex === -1) {
      result.push(remaining.shift()!);
    } else {
      result.push(remaining.splice(swapIndex, 1)[0]!);
    }
  }

  return result;
}

function countTrailingType(items: ScoredDraftWithScore[]): number {
  if (items.length === 0) return 0;
  const lastType = items[items.length - 1]!.cardType;
  let count = 0;
  for (let i = items.length - 1; i >= 0; i--) {
    if (items[i]!.cardType !== lastType) break;
    count++;
  }
  return count;
}

function applyDocumentDiversity(
  sorted: ScoredDraftWithScore[],
  config: ScoringConfig,
): ScoredDraftWithScore[] {
  const effectiveSize = Math.min(sorted.length, config.batchSize);
  const maxPerDoc = Math.max(1, Math.floor(effectiveSize * config.documentDiversityCap));
  const docCounts = new Map<string, number>();
  const accepted: ScoredDraftWithScore[] = [];
  const demoted: ScoredDraftWithScore[] = [];

  for (const draft of sorted) {
    const count = docCounts.get(draft.documentId) ?? 0;
    if (count < maxPerDoc) {
      accepted.push(draft);
      docCounts.set(draft.documentId, count + 1);
    } else {
      demoted.push(draft);
    }
  }

  return [...accepted, ...demoted];
}
