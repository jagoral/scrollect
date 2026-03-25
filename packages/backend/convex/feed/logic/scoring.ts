import { computeRecencyBoost, HIGHLIGHT_BOOST, MAX_CONSECUTIVE_SAME_TYPE } from "./constants";

export type ScoringConfig = {
  highlightBoost: number;
  maxConsecutiveSameType: number;
  documentDiversityCap: number;
  batchSize: number;
  replenishmentThreshold: number;
};

export const DEFAULT_SCORING_CONFIG: ScoringConfig = {
  highlightBoost: HIGHLIGHT_BOOST,
  maxConsecutiveSameType: MAX_CONSECUTIVE_SAME_TYPE,
  documentDiversityCap: 0.4,
  batchSize: 15,
  replenishmentThreshold: 10,
};

export type ScoredDraft = {
  id: string;
  documentId: string;
  cardType: string;
  strategy: string;
  qualityScore: number;
  servedCount: number;
  totalDraftsForDocument: number;
  documentCreatedAt: number;
};

export type ScoredDraftWithScore = ScoredDraft & { score: number };

export function scoreDrafts(opts: {
  drafts: ScoredDraft[];
  config: ScoringConfig;
  now: number;
}): ScoredDraftWithScore[] {
  const { drafts, config, now } = opts;

  const scored = drafts.map((draft) => {
    const recencyBoost = computeRecencyBoost(draft.documentCreatedAt, now);
    const highlightMultiplier = draft.strategy === "highlight" ? config.highlightBoost : 1.0;
    const saturationPenalty = 1 / (1 + draft.servedCount / draft.totalDraftsForDocument);
    const score = draft.qualityScore * recencyBoost * highlightMultiplier * saturationPenalty;
    return { ...draft, score };
  });

  scored.sort((a, b) => b.score - a.score);

  const reordered = applyTypeDiversity(scored, config.maxConsecutiveSameType);
  return applyDocumentDiversity(reordered, config);
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
