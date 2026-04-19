import { computeEffectiveQuality, type ScoredDraft, type ScoredDraftWithScore } from "./scoring";

/**
 * "First session" per ADR-018 §7:
 *  - the document's `createdAt` is within 24h, AND
 *  - the document had cumulative `servedCount == 0` before this batch.
 *
 * Both must hold. We compute this per-document against the draft pool as it stood at the
 * start of the serve call (i.e. before any `servedCount++` patch), so repeat serves on the
 * same document within 24h only count the very first batch.
 */
export const FIRST_SESSION_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Top-N considered for first-session metrics. Matches the DDIA AC ("first 10 served"). */
export const FIRST_SESSION_TOP_N = 10;

/**
 * Histogram buckets for the serving quality distribution. Half-open [low, high) intervals
 * except for the top bucket which is [0.9, 1.0]. Chosen for PostHog ingestion (flat
 * record of bucket-label to count).
 */
export const QUALITY_DISTRIBUTION_BUCKETS: Array<{ label: string; low: number; high: number }> = [
  { label: "b_0_0_2", low: 0, high: 0.2 },
  { label: "b_0_2_0_4", low: 0.2, high: 0.4 },
  { label: "b_0_4_0_5", low: 0.4, high: 0.5 },
  { label: "b_0_5_0_6", low: 0.5, high: 0.6 },
  { label: "b_0_6_0_7", low: 0.6, high: 0.7 },
  { label: "b_0_7_0_8", low: 0.7, high: 0.8 },
  { label: "b_0_8_0_9", low: 0.8, high: 0.9 },
  { label: "b_0_9_1_0", low: 0.9, high: 1.0 + Number.EPSILON },
];

export type DocumentSessionInput = {
  documentId: string;
  documentCreatedAt: number;
  priorServedCount: number;
};

export type FirstSessionDocumentBatch = {
  documentId: string;
  topDrafts: ScoredDraftWithScore[];
  priorServedCount: number;
  documentCreatedAt: number;
};

export type BookDepthReach = {
  documentId: string;
  cardCount: number;
  maxBookPosition: number;
  minBookPosition: number;
  spreadBookPosition: number;
  populatedQuartiles: number;
};

export type CardTypeMix = {
  documentId: string;
  cardCount: number;
  /**
   * Flat record (card type → count). PostHog ingests this shape cleanly; keep it small —
   * only four draft card types exist today.
   */
  mix: Record<string, number>;
};

export type QualityDistribution = {
  totalCards: number;
  mean: number;
  std: number;
  belowThreshold07Share: number;
  /** Flat `bucket_label → count` map. Small, stable key set. */
  buckets: Record<string, number>;
};

export type GoalRelevanceSummary = {
  applied: boolean;
  /**
   * Fraction of the top-K candidate sections that had an embedding available at serve
   * time. Architect-reviewer I3: this lets ops distinguish "goal off" from "goal on but
   * degraded to 1.0 because vectors were missing".
   */
  sectionEmbeddingCoveragePercent: number;
  /**
   * Mean of `goalRelevance - 1` applied across the served batch, i.e. the actual boost
   * magnitude users experienced. 0.0 when no goal is present or when no served drafts had
   * a usable section vector.
   */
  meanRelevanceBoost: number;
  /** Count of served drafts whose relevance was strictly greater than 1.0. */
  boostedCardCount: number;
};

/**
 * Decide which documents contributed to a first-session batch. A document qualifies when
 * its draft pool row was created within 24h AND the document had a cumulative
 * `servedCount == 0` across all its drafts before this batch. When the served batch spans
 * multiple documents, we evaluate each independently.
 */
export function firstSessionDocuments(opts: {
  topDrafts: ScoredDraftWithScore[];
  documentInputs: DocumentSessionInput[];
  now: number;
}): FirstSessionDocumentBatch[] {
  const inputByDoc = new Map(opts.documentInputs.map((d) => [d.documentId, d]));
  const byDoc = new Map<string, ScoredDraftWithScore[]>();
  for (const draft of opts.topDrafts) {
    const list = byDoc.get(draft.documentId) ?? [];
    list.push(draft);
    byDoc.set(draft.documentId, list);
  }

  const result: FirstSessionDocumentBatch[] = [];
  for (const [documentId, drafts] of byDoc) {
    const info = inputByDoc.get(documentId);
    if (!info) continue;
    const age = opts.now - info.documentCreatedAt;
    if (age < 0 || age >= FIRST_SESSION_WINDOW_MS) continue;
    if (info.priorServedCount !== 0) continue;
    result.push({
      documentId,
      topDrafts: drafts.slice(0, FIRST_SESSION_TOP_N),
      priorServedCount: info.priorServedCount,
      documentCreatedAt: info.documentCreatedAt,
    });
  }
  return result;
}

export function computeBookDepthReach(batch: FirstSessionDocumentBatch): BookDepthReach | null {
  const positions: number[] = [];
  const quartiles = new Set<number>();
  for (const draft of batch.topDrafts) {
    if (draft.chunkStartIndex === undefined) continue;
    if (draft.documentChunkCount === undefined || draft.documentChunkCount <= 0) continue;
    const ratio = draft.chunkStartIndex / draft.documentChunkCount;
    const clamped = Math.max(0, Math.min(1, ratio));
    positions.push(clamped);
    quartiles.add(Math.min(3, Math.floor(clamped * 4)));
  }
  if (positions.length === 0) return null;
  const max = Math.max(...positions);
  const min = Math.min(...positions);
  return {
    documentId: batch.documentId,
    cardCount: positions.length,
    maxBookPosition: round3(max),
    minBookPosition: round3(min),
    spreadBookPosition: round3(max - min),
    populatedQuartiles: quartiles.size,
  };
}

export function computeCardTypeMix(batch: FirstSessionDocumentBatch): CardTypeMix {
  const mix: Record<string, number> = {};
  for (const draft of batch.topDrafts) {
    mix[draft.cardType] = (mix[draft.cardType] ?? 0) + 1;
  }
  return {
    documentId: batch.documentId,
    cardCount: batch.topDrafts.length,
    mix,
  };
}

export function computeQualityDistribution(drafts: ScoredDraft[]): QualityDistribution | null {
  if (drafts.length === 0) return null;
  const quality = drafts.map(computeEffectiveQuality);
  const mean = quality.reduce((s, x) => s + x, 0) / quality.length;
  const variance = quality.reduce((s, x) => s + (x - mean) ** 2, 0) / quality.length;
  const std = Math.sqrt(variance);
  const belowCount = quality.filter((q) => q < 0.7).length;
  const buckets: Record<string, number> = {};
  for (const bucket of QUALITY_DISTRIBUTION_BUCKETS) {
    buckets[bucket.label] = 0;
  }
  for (const q of quality) {
    const bucket = QUALITY_DISTRIBUTION_BUCKETS.find((b) => q >= b.low && q < b.high);
    if (bucket) buckets[bucket.label]! += 1;
  }
  return {
    totalCards: drafts.length,
    mean: round3(mean),
    std: round3(std),
    belowThreshold07Share: round3(belowCount / quality.length),
    buckets,
  };
}

export function summarizeGoalRelevance(opts: {
  /** Per-document goal embeddings, keyed by `documentId`. Per ADR-018 §3. */
  goalEmbeddingByDocument: ReadonlyMap<string, number[]> | undefined;
  topDrafts: ScoredDraftWithScore[];
  /** Raw section-vec map passed to the scorer (post-fetch). May be undefined when no goal. */
  sectionEmbeddings: ReadonlyMap<string, number[]> | undefined;
  /** Section IDs considered for the bounded top-K candidate fetch. */
  candidateSectionIds: string[];
  goalRelevanceAlpha: number;
  goalRelevanceFloor: number;
}): GoalRelevanceSummary {
  const goalMap = opts.goalEmbeddingByDocument;
  if (!goalMap || goalMap.size === 0) {
    return {
      applied: false,
      sectionEmbeddingCoveragePercent: 0,
      meanRelevanceBoost: 0,
      boostedCardCount: 0,
    };
  }

  // Embedding dimensions are shared across the goal map (same provider, same model) so
  // peek the first entry to size coverage checks.
  const expectedDim = goalMap.values().next().value?.length ?? 0;
  const unique = [...new Set(opts.candidateSectionIds)];
  const covered = unique.filter((id) => {
    const vec = opts.sectionEmbeddings?.get(id);
    return vec !== undefined && vec.length === expectedDim;
  });
  const coverage = unique.length === 0 ? 0 : covered.length / unique.length;

  let totalBoost = 0;
  let boostedCards = 0;
  let relevantDrafts = 0;
  for (const draft of opts.topDrafts) {
    const goalEmbedding = goalMap.get(draft.documentId);
    if (!goalEmbedding || goalEmbedding.length === 0) continue;
    const sectionId = draft.sectionSummaryId;
    if (!sectionId) continue;
    const vec = opts.sectionEmbeddings?.get(sectionId);
    if (!vec || vec.length === 0) continue;
    if (vec.length !== goalEmbedding.length) continue;
    const cosine = cosineSimilarity(goalEmbedding, vec);
    const boost = opts.goalRelevanceAlpha * Math.max(0, cosine - opts.goalRelevanceFloor);
    totalBoost += boost;
    if (boost > 0) boostedCards++;
    relevantDrafts++;
  }

  return {
    applied: true,
    sectionEmbeddingCoveragePercent: round3(coverage),
    meanRelevanceBoost: relevantDrafts === 0 ? 0 : round3(totalBoost / relevantDrafts),
    boostedCardCount: boostedCards,
  };
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

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
