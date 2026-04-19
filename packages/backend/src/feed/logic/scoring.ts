import {
  computeRecencyBoost,
  HIGHLIGHT_BOOST,
  MAX_CONSECUTIVE_SAME_TYPE,
  REACTION_ALREADY_KNOW_MULTIPLIER,
  REACTION_LIKE_CARD_TYPE_MULTIPLIER,
  REACTION_LIKE_SECTION_MULTIPLIER,
  REACTION_NOT_INTERESTING_MULTIPLIER,
  REACTION_WRONG_TYPE_MULTIPLIER,
  SECTION_DIVERSITY_CAP,
} from "./constants";

export const GOAL_RELEVANCE_ALPHA = 0.6;
export const GOAL_RELEVANCE_FLOOR = 0.1;
export const FRONT_MATTER_PENALTY = 0.2;
export const FRONT_MATTER_THRESHOLD = 0.3;
export const MAX_QUOTE_SHARE = 0.3;
export const MAX_QUIZ_SHARE = 0.3;
export const BOOK_POSITION_BUCKET_COUNT = 4;
export const SEMANTIC_QUALITY_WEIGHT = 0.7;
export const SECTION_QUALITY_WEIGHT = 0.3;

export type ScoringConfig = {
  highlightBoost: number;
  maxConsecutiveSameType: number;
  documentDiversityCap: number;
  sectionDiversityCap: number;
  batchSize: number;
  replenishmentThreshold: number;
  reactionNotInterestingMultiplier: number;
  reactionAlreadyKnowMultiplier: number;
  reactionWrongTypeMultiplier: number;
  reactionLikeSectionMultiplier: number;
  reactionLikeCardTypeMultiplier: number;
  goalRelevanceAlpha: number;
  goalRelevanceFloor: number;
  frontMatterPenalty: number;
  frontMatterThreshold: number;
  maxQuoteShare: number;
  maxQuizShare: number;
  bookPositionBucketCount: number;
};

export const DEFAULT_SCORING_CONFIG: ScoringConfig = {
  highlightBoost: HIGHLIGHT_BOOST,
  maxConsecutiveSameType: MAX_CONSECUTIVE_SAME_TYPE,
  documentDiversityCap: 0.4,
  sectionDiversityCap: SECTION_DIVERSITY_CAP,
  batchSize: 15,
  replenishmentThreshold: 10,
  reactionNotInterestingMultiplier: REACTION_NOT_INTERESTING_MULTIPLIER,
  reactionAlreadyKnowMultiplier: REACTION_ALREADY_KNOW_MULTIPLIER,
  reactionWrongTypeMultiplier: REACTION_WRONG_TYPE_MULTIPLIER,
  reactionLikeSectionMultiplier: REACTION_LIKE_SECTION_MULTIPLIER,
  reactionLikeCardTypeMultiplier: REACTION_LIKE_CARD_TYPE_MULTIPLIER,
  goalRelevanceAlpha: GOAL_RELEVANCE_ALPHA,
  goalRelevanceFloor: GOAL_RELEVANCE_FLOOR,
  frontMatterPenalty: FRONT_MATTER_PENALTY,
  frontMatterThreshold: FRONT_MATTER_THRESHOLD,
  maxQuoteShare: MAX_QUOTE_SHARE,
  maxQuizShare: MAX_QUIZ_SHARE,
  bookPositionBucketCount: BOOK_POSITION_BUCKET_COUNT,
};

export type ScoredDraft = {
  id: string;
  documentId: string;
  sectionSummaryId?: string;
  cardType: string;
  strategy: string;
  qualityScore: number;
  /** Per ADR-018: semantic learning value from the validator LLM. Optional fallback to qualityScore. */
  semanticQualityScore?: number;
  /** Per ADR-018: section-level signal from the #215 ranker, copied onto the draft at write time. */
  sectionQualitySignal?: number;
  servedCount: number;
  totalDraftsForDocument: number;
  documentCreatedAt: number;
  /** Section start index in the document, used for book-position diversity. Optional. */
  chunkStartIndex?: number;
  /** Document chunk count, used to normalize bookPosition into [0, 1]. Optional. */
  documentChunkCount?: number;
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

/**
 * Score and reorder a draft pool for serving.
 *
 * Pure function - no Convex ctx, no I/O. The caller (the `serveFeed` mutation) is
 * responsible for fetching the goal embedding and section embeddings via
 * `getEffectiveLearningGoalEmbedding` and `fetchSectionEmbeddings` and passing them in.
 *
 * Backward compatibility:
 * - When `semanticQualityScore` is missing, falls back to `qualityScore` for that draft.
 * - When `sectionQualitySignal` is missing, the front-matter penalty does not apply
 *   (penalty is `1.0`).
 * - When `goalEmbedding` is missing or a draft's section vector is missing, that draft's
 *   `goalRelevance` is `1.0`.
 * - When `chunkStartIndex` / `documentChunkCount` are missing for any draft in the pool,
 *   the book-position diversity pass is a no-op for the entire pool.
 *
 * Pass order (each later pass may demote earlier picks): score → sort → book-position
 * round-robin → quote-share cap → quiz-share cap → type diversity → section diversity →
 * document diversity. This matches ADR-018 §5 and §6.
 */
export function scoreDrafts(opts: {
  drafts: ScoredDraft[];
  config: ScoringConfig;
  now: number;
  reactionSummary?: ReactionSummary;
  goalEmbedding?: number[];
  sectionEmbeddings?: Map<string, number[]>;
}): ScoredDraftWithScore[] {
  const { drafts, config, now, reactionSummary, goalEmbedding, sectionEmbeddings } = opts;

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
    const effectiveQuality = computeEffectiveQuality(draft);
    const goalRelevance = computeGoalRelevance(draft, goalEmbedding, sectionEmbeddings, config);
    const frontMatterPenalty = computeFrontMatterPenalty(draft, config);
    const score =
      effectiveQuality *
      recencyBoost *
      highlightMultiplier *
      saturationPenalty *
      reactionMultiplier *
      goalRelevance *
      frontMatterPenalty;
    return { ...draft, score };
  });

  scored.sort((a, b) => b.score - a.score);

  // Diversity passes run sequentially. Earlier passes prioritize spread across the document
  // (book position), then enforce per-type share caps, then the legacy type/section/document
  // passes. Each later pass may partially undo an earlier promotion - that is intentional
  // and matches ADR-016's "later passes win" guarantee from the existing scorer.
  const bookReordered = applyBookPositionDiversity(scored, config);
  const quoteCapped = applyCardTypeShareCap(bookReordered, "quote", config.maxQuoteShare, config);
  const quizCapped = applyCardTypeShareCap(quoteCapped, "quiz", config.maxQuizShare, config);
  const typeReordered = applyTypeDiversity(quizCapped, config.maxConsecutiveSameType);
  const sectionReordered = applySectionDiversity(typeReordered, config);
  return applyDocumentDiversity(sectionReordered, config);
}

/**
 * Compute the `effectiveQuality` term used by the scorer.
 *
 * Exported so the serving site can emit the serving-quality-distribution analytics event
 * using exactly the same math as ranking. Per ADR-018 §4: when both card and section
 * signals exist, blend with card-level dominant; when only semantic exists, use it
 * alone; otherwise fall back to the structural `qualityScore` so old drafts keep working.
 */
export function computeEffectiveQuality(draft: ScoredDraft): number {
  if (draft.semanticQualityScore !== undefined && draft.sectionQualitySignal !== undefined) {
    return (
      SEMANTIC_QUALITY_WEIGHT * draft.semanticQualityScore +
      SECTION_QUALITY_WEIGHT * draft.sectionQualitySignal
    );
  }
  if (draft.semanticQualityScore !== undefined) {
    return draft.semanticQualityScore;
  }
  return draft.qualityScore;
}

function computeGoalRelevance(
  draft: ScoredDraft,
  goalEmbedding: number[] | undefined,
  sectionEmbeddings: Map<string, number[]> | undefined,
  config: ScoringConfig,
): number {
  if (!goalEmbedding || goalEmbedding.length === 0) return 1.0;
  if (!draft.sectionSummaryId) return 1.0;
  if (!sectionEmbeddings) return 1.0;
  const sectionVec = sectionEmbeddings.get(draft.sectionSummaryId);
  if (!sectionVec || sectionVec.length === 0) return 1.0;
  if (sectionVec.length !== goalEmbedding.length) return 1.0;
  const cosine = cosineSimilarity(goalEmbedding, sectionVec);
  return 1 + config.goalRelevanceAlpha * Math.max(0, cosine - config.goalRelevanceFloor);
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const av = a[i]!;
    const bv = b[i]!;
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function computeFrontMatterPenalty(draft: ScoredDraft, config: ScoringConfig): number {
  if (draft.sectionQualitySignal === undefined) return 1.0;
  return draft.sectionQualitySignal < config.frontMatterThreshold ? config.frontMatterPenalty : 1.0;
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

/**
 * Round-robin pick across book-depth quartiles so the first batch reaches across the
 * document instead of clustering near the beginning. ADR-018 §5.
 *
 * Degrades gracefully:
 * - Returns input untouched if any draft lacks `chunkStartIndex` or `documentChunkCount`
 *   (e.g. highlight/thematic drafts, or pre-ADR documents).
 * - Returns input untouched if fewer than 2 distinct quartiles are populated.
 *
 * Picks the highest-scored remaining card from each non-empty quartile in turn until
 * `batchSize` items are accepted, then appends the rest in their original (score) order
 * as demoted tail. Round-robin starts from the lowest-occupied quartile.
 */
function applyBookPositionDiversity(
  sorted: ScoredDraftWithScore[],
  config: ScoringConfig,
): ScoredDraftWithScore[] {
  if (sorted.length === 0) return sorted;
  const bucketCount = config.bookPositionBucketCount;
  if (bucketCount <= 1) return sorted;

  const buckets: ScoredDraftWithScore[][] = Array.from({ length: bucketCount }, () => []);
  for (const draft of sorted) {
    const bucket = bookPositionBucketIndex(draft, bucketCount);
    if (bucket === undefined) {
      // Missing position metadata for any draft: pass is a no-op for the whole pool.
      return sorted;
    }
    buckets[bucket]!.push(draft);
  }

  const populatedBuckets = buckets.filter((b) => b.length > 0);
  if (populatedBuckets.length < 2) return sorted;

  const accepted: ScoredDraftWithScore[] = [];
  const seen = new Set<string>();
  const target = Math.min(sorted.length, config.batchSize);

  while (accepted.length < target) {
    let pickedThisRound = false;
    for (const bucket of populatedBuckets) {
      if (accepted.length >= target) break;
      const next = bucket.shift();
      if (!next) continue;
      accepted.push(next);
      seen.add(next.id);
      pickedThisRound = true;
    }
    if (!pickedThisRound) break;
  }

  const tail = sorted.filter((d) => !seen.has(d.id));
  return [...accepted, ...tail];
}

function bookPositionBucketIndex(draft: ScoredDraft, bucketCount: number): number | undefined {
  if (draft.chunkStartIndex === undefined) return undefined;
  if (draft.documentChunkCount === undefined || draft.documentChunkCount <= 0) return undefined;
  const ratio = draft.chunkStartIndex / draft.documentChunkCount;
  const clamped = Math.max(0, Math.min(0.999_999, ratio));
  return Math.floor(clamped * bucketCount);
}

/**
 * Demote-to-tail share cap for a single card type within the served batch. ADR-018 §6.
 * The "share" is computed against the eventual batch size, so a 30% cap on a batch of 15
 * allows at most 4 quotes (or 4 quizzes) in the accepted prefix; additional cards of the
 * capped type are pushed to the tail behind any other-type cards.
 *
 * Same shape as the existing `applyDocumentDiversity` so cap semantics stay consistent.
 */
function applyCardTypeShareCap(
  sorted: ScoredDraftWithScore[],
  cardType: string,
  share: number,
  config: ScoringConfig,
): ScoredDraftWithScore[] {
  if (share >= 1) return sorted;
  if (share <= 0) {
    // Treat 0 as "demote all of this type." Still include them at the tail to preserve order.
    const matching = sorted.filter((d) => d.cardType === cardType);
    const others = sorted.filter((d) => d.cardType !== cardType);
    return [...others, ...matching];
  }
  const effectiveSize = Math.min(sorted.length, config.batchSize);
  const cap = Math.max(1, Math.floor(effectiveSize * share));
  const accepted: ScoredDraftWithScore[] = [];
  const demoted: ScoredDraftWithScore[] = [];
  let acceptedOfType = 0;
  for (const draft of sorted) {
    if (draft.cardType === cardType) {
      if (acceptedOfType < cap) {
        accepted.push(draft);
        acceptedOfType++;
      } else {
        demoted.push(draft);
      }
    } else {
      accepted.push(draft);
    }
  }
  return [...accepted, ...demoted];
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

function applySectionDiversity(
  sorted: ScoredDraftWithScore[],
  config: ScoringConfig,
): ScoredDraftWithScore[] {
  const effectiveSize = Math.min(sorted.length, config.batchSize);
  const maxPerSection = Math.max(1, Math.floor(effectiveSize * config.sectionDiversityCap));
  const sectionCounts = new Map<string, number>();
  const accepted: ScoredDraftWithScore[] = [];
  const demoted: ScoredDraftWithScore[] = [];

  for (const draft of sorted) {
    const key = draft.sectionSummaryId ?? draft.documentId;
    const count = sectionCounts.get(key) ?? 0;
    if (count < maxPerSection) {
      accepted.push(draft);
      sectionCounts.set(key, count + 1);
    } else {
      demoted.push(draft);
    }
  }

  return [...accepted, ...demoted];
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
