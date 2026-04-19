/**
 * Fixture types for the feed-serving ranking eval (issue #216, ADR-018).
 *
 * These types mirror the extended `ScoredDraft` shape defined in ADR-018.
 * The eval harness consumes them directly. When Backend's Task 5 lands
 * (`scoreDrafts` signature gains `goalEmbedding?: number[]` and
 * `sectionEmbeddings: Map<string, number[]>`), the wiring in
 * `feedServing.eval.ts` forwards these fields through to the real scorer.
 * Until then the reference ranker in `referenceRanker.ts` stands in.
 *
 * Naming follows ADR-018 field names exactly so the wire-up is mechanical:
 *  - `semanticQualityScore` - card-level semantic judgement (0-1).
 *  - `sectionQualitySignal` - section-level ranker signal (0-1).
 *    A section is treated as front matter when `sectionQualitySignal < 0.3`.
 *  - `qualityScore` - legacy structural score, used as fallback.
 */

export type FixtureLanguage = "en" | "pl" | "de";

export type FixtureCardType = "insight" | "summary" | "quote" | "quiz" | "connection";

export type FixtureDraft = {
  draftId: string;
  documentId: string;
  sectionId: string;
  sectionTitle: string;
  /** Section's chunk offset. Used with `FeedServingFixture.documentChunkCount` to derive bookPosition. */
  chunkStartIndex: number;
  chunkEndIndex: number;
  /** Card-level semantic learning value. 0-1. MUST have real distribution across the pool. */
  semanticQualityScore: number;
  /** Section-level ranker signal (from #215). 0-1. < 0.3 marks front matter. */
  sectionQualitySignal: number;
  /** Legacy structural score. Saturates near 1.0 like DDIA production data. Used only as a fallback. */
  qualityScore: number;
  cardType: FixtureCardType;
  strategy: "initial" | "highlight" | "replenishment";
  language: FixtureLanguage;
  /** Human-readable preview. Used by snapshot assertions in scorers. */
  contentPreview: string;
};

export type FeedServingFixture = {
  id: string;
  description: string;
  /** DDIA-like: 803 chunks, 12 chapters, substantive sections + front matter + non-English. */
  documentId: string;
  documentTitle: string;
  documentChunkCount: number;
  primaryLanguage: FixtureLanguage;
  /** The active learning goal. Empty string models "goal cleared". */
  learningGoal: string;
  /**
   * Embedding of `learningGoal`. Undefined when the goal is cleared. Matches
   * ADR-018's `documents.learningGoalEmbedding` shape.
   */
  goalEmbedding: number[] | undefined;
  /**
   * Section-level embeddings keyed by `sectionId`. Feeds the ADR-018
   * `sectionEmbeddings` param on `scoreDrafts`.
   */
  sectionEmbeddings: Map<string, number[]>;
  drafts: FixtureDraft[];
};

export function bookPositionOf(draft: FixtureDraft, chunkCount: number): number {
  return draft.chunkStartIndex / chunkCount;
}
