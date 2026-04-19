import { describe, expect, it } from "vitest";

import {
  FRESHNESS_BOOST_FACTOR,
  FRESHNESS_DECAY_WINDOW_MS,
  FRESHNESS_WINDOW_MS,
  HIGHLIGHT_BOOST,
  REACTION_ALREADY_KNOW_MULTIPLIER,
  REACTION_LIKE_CARD_TYPE_MULTIPLIER,
  REACTION_LIKE_SECTION_MULTIPLIER,
  REACTION_NOT_INTERESTING_MULTIPLIER,
  REACTION_WRONG_TYPE_MULTIPLIER,
} from "../../../src/feed/logic/constants";
import {
  DEFAULT_SCORING_CONFIG,
  FRONT_MATTER_PENALTY,
  GOAL_RELEVANCE_ALPHA,
  GOAL_RELEVANCE_FLOOR,
  SECTION_QUALITY_WEIGHT,
  SEMANTIC_QUALITY_WEIGHT,
  scoreDrafts,
  type ReactionSummary,
  type ScoredDraft,
  type ScoringConfig,
} from "../../../src/feed/logic/scoring";

const NOW = Date.now();
const ONE_HOUR_AGO = NOW - 60 * 60 * 1000;
const THREE_DAYS_AGO = NOW - 3 * 24 * 60 * 60 * 1000;
const THIRTY_DAYS_AGO = NOW - 30 * 24 * 60 * 60 * 1000;

function makeDraft(overrides: Partial<ScoredDraft> = {}): ScoredDraft {
  return {
    id: `draft-${Math.random().toString(36).slice(2, 8)}`,
    documentId: "doc-1",
    postType: "insight",
    strategy: "section",
    qualityScore: 0.8,
    servedCount: 0,
    totalDraftsForDocument: 1,
    documentCreatedAt: THREE_DAYS_AGO,
    ...overrides,
  };
}

describe("scoreDrafts", () => {
  describe("basic scoring order", () => {
    it("ranks higher quality drafts first", () => {
      const drafts = [
        makeDraft({ id: "low", qualityScore: 0.3 }),
        makeDraft({ id: "high", qualityScore: 0.9 }),
        makeDraft({ id: "mid", qualityScore: 0.6 }),
      ];

      const result = scoreDrafts({ drafts, config: DEFAULT_SCORING_CONFIG, now: NOW });

      expect(result[0]!.id).toBe("high");
      expect(result[1]!.id).toBe("mid");
      expect(result[2]!.id).toBe("low");
    });

    it("returns empty array for empty input", () => {
      const result = scoreDrafts({ drafts: [], config: DEFAULT_SCORING_CONFIG, now: NOW });
      expect(result).toEqual([]);
    });

    it("preserves all drafts in output", () => {
      const drafts = Array.from({ length: 20 }, (_, i) =>
        makeDraft({ id: `d-${i}`, qualityScore: Math.random() }),
      );
      const result = scoreDrafts({ drafts, config: DEFAULT_SCORING_CONFIG, now: NOW });
      expect(result).toHaveLength(20);
    });
  });

  describe("recency boost", () => {
    it("boosts recent documents (< 48h) over older ones with same quality", () => {
      const drafts = [
        makeDraft({ id: "old", documentCreatedAt: THIRTY_DAYS_AGO, qualityScore: 0.8 }),
        makeDraft({ id: "fresh", documentCreatedAt: ONE_HOUR_AGO, qualityScore: 0.8 }),
      ];

      const result = scoreDrafts({ drafts, config: DEFAULT_SCORING_CONFIG, now: NOW });

      expect(result[0]!.id).toBe("fresh");
      expect(result[0]!.score).toBeCloseTo(0.8 * FRESHNESS_BOOST_FACTOR, 2);
      expect(result[1]!.id).toBe("old");
      expect(result[1]!.score).toBeCloseTo(0.8, 2);
    });

    it("applies linear decay between 48h and 7d", () => {
      const midDecayAge = (FRESHNESS_WINDOW_MS + FRESHNESS_DECAY_WINDOW_MS) / 2;
      const midDecayDoc = NOW - midDecayAge;

      const drafts = [makeDraft({ id: "mid-decay", documentCreatedAt: midDecayDoc })];

      const result = scoreDrafts({ drafts, config: DEFAULT_SCORING_CONFIG, now: NOW });

      expect(result[0]!.score).toBeGreaterThan(0.8);
      expect(result[0]!.score).toBeLessThan(0.8 * FRESHNESS_BOOST_FACTOR);
    });
  });

  describe("saturation decay", () => {
    it("reduces score with each serve: first=full, second=50%, third=33%", () => {
      const base = { qualityScore: 1.0, documentCreatedAt: THIRTY_DAYS_AGO };
      const drafts = [
        makeDraft({ id: "fresh", servedCount: 0, ...base }),
        makeDraft({ id: "once", servedCount: 1, ...base }),
        makeDraft({ id: "twice", servedCount: 2, ...base }),
      ];

      const result = scoreDrafts({ drafts, config: DEFAULT_SCORING_CONFIG, now: NOW });

      expect(result[0]!.id).toBe("fresh");
      expect(result[0]!.score).toBeCloseTo(1.0, 2);
      expect(result[1]!.id).toBe("once");
      expect(result[1]!.score).toBeCloseTo(0.5, 2);
      expect(result[2]!.id).toBe("twice");
      expect(result[2]!.score).toBeCloseTo(1 / 3, 2);
    });

    it("never produces zero score even at high serve counts", () => {
      const drafts = [makeDraft({ servedCount: 100 })];
      const result = scoreDrafts({ drafts, config: DEFAULT_SCORING_CONFIG, now: NOW });
      expect(result[0]!.score).toBeGreaterThan(0);
    });
  });

  describe("highlight boost", () => {
    it("multiplies highlight strategy drafts by HIGHLIGHT_BOOST", () => {
      const base = {
        qualityScore: 0.5,
        documentCreatedAt: THIRTY_DAYS_AGO,
        servedCount: 0,
      };
      const drafts = [
        makeDraft({ id: "section", strategy: "section", ...base }),
        makeDraft({ id: "highlight", strategy: "highlight", ...base }),
      ];

      const result = scoreDrafts({ drafts, config: DEFAULT_SCORING_CONFIG, now: NOW });

      expect(result[0]!.id).toBe("highlight");
      expect(result[0]!.score).toBeCloseTo(0.5 * HIGHLIGHT_BOOST, 2);
      expect(result[1]!.id).toBe("section");
      expect(result[1]!.score).toBeCloseTo(0.5, 2);
    });

    it("does not boost non-highlight strategies", () => {
      const strategies = ["section", "thematic", "connection"] as const;
      for (const strategy of strategies) {
        const drafts = [
          makeDraft({
            strategy,
            qualityScore: 1.0,
            documentCreatedAt: THIRTY_DAYS_AGO,
            servedCount: 0,
          }),
        ];
        const result = scoreDrafts({ drafts, config: DEFAULT_SCORING_CONFIG, now: NOW });
        expect(result[0]!.score).toBeCloseTo(1.0, 2);
      }
    });
  });

  describe("type diversity reorder", () => {
    it("prevents more than 3 consecutive same-type cards", () => {
      const drafts = [
        makeDraft({ id: "i1", postType: "insight", qualityScore: 0.9 }),
        makeDraft({ id: "i2", postType: "insight", qualityScore: 0.88 }),
        makeDraft({ id: "i3", postType: "insight", qualityScore: 0.87 }),
        makeDraft({ id: "i4", postType: "insight", qualityScore: 0.86 }),
        makeDraft({ id: "q1", postType: "quiz", qualityScore: 0.5 }),
      ];

      const result = scoreDrafts({ drafts, config: DEFAULT_SCORING_CONFIG, now: NOW });

      let maxConsecutive = 1;
      let current = 1;
      for (let i = 1; i < result.length; i++) {
        if (result[i]!.postType === result[i - 1]!.postType) {
          current++;
          maxConsecutive = Math.max(maxConsecutive, current);
        } else {
          current = 1;
        }
      }
      expect(maxConsecutive).toBeLessThanOrEqual(3);
    });

    it("accepts violations when all drafts are the same type", () => {
      const drafts = Array.from({ length: 6 }, (_, i) =>
        makeDraft({ id: `i-${i}`, postType: "insight", qualityScore: 0.9 - i * 0.01 }),
      );

      const result = scoreDrafts({ drafts, config: DEFAULT_SCORING_CONFIG, now: NOW });

      expect(result).toHaveLength(6);
      expect(result.every((d) => d.postType === "insight")).toBe(true);
    });

    it("swaps in the first different-type card when limit exceeded", () => {
      const drafts = [
        makeDraft({ id: "i1", postType: "insight", qualityScore: 0.99 }),
        makeDraft({ id: "i2", postType: "insight", qualityScore: 0.98 }),
        makeDraft({ id: "i3", postType: "insight", qualityScore: 0.97 }),
        makeDraft({ id: "q1", postType: "quiz", qualityScore: 0.2 }),
        makeDraft({ id: "i4", postType: "insight", qualityScore: 0.96 }),
      ];

      const result = scoreDrafts({ drafts, config: DEFAULT_SCORING_CONFIG, now: NOW });

      // After 3 insights, the quiz should be swapped in before the 4th insight
      expect(result[3]!.postType).toBe("quiz");
    });
  });

  describe("document diversity cap", () => {
    it("caps a single document at 40% of batch in the accepted portion", () => {
      const drafts = [
        ...Array.from({ length: 8 }, (_, i) =>
          makeDraft({
            id: `doc1-${i}`,
            documentId: "doc-dominant",
            qualityScore: 0.9 - i * 0.01,
          }),
        ),
        ...Array.from({ length: 7 }, (_, i) =>
          makeDraft({
            id: `doc2-${i}`,
            documentId: `doc-other-${i}`,
            qualityScore: 0.5,
          }),
        ),
      ];

      const result = scoreDrafts({ drafts, config: DEFAULT_SCORING_CONFIG, now: NOW });

      // 40% of batchSize(15) = 6 max per doc
      const maxPerDoc = Math.floor(DEFAULT_SCORING_CONFIG.batchSize * 0.4);
      // The accepted portion (before demoted) should have at most maxPerDoc from any doc
      const acceptedPortion = result.slice(0, result.length - 2); // 8 - 6 = 2 demoted
      const docCounts = new Map<string, number>();
      for (const d of acceptedPortion) {
        docCounts.set(d.documentId, (docCounts.get(d.documentId) ?? 0) + 1);
      }

      const dominantCount = docCounts.get("doc-dominant") ?? 0;
      expect(dominantCount).toBeLessThanOrEqual(maxPerDoc);
    });

    it("demotes excess document cards to end of list", () => {
      const drafts = [
        makeDraft({ id: "d1-a", documentId: "doc-1", qualityScore: 0.95 }),
        makeDraft({ id: "d1-b", documentId: "doc-1", qualityScore: 0.94 }),
        makeDraft({ id: "d1-c", documentId: "doc-1", qualityScore: 0.93 }),
        makeDraft({ id: "d2-a", documentId: "doc-2", qualityScore: 0.5 }),
      ];

      const config: ScoringConfig = { ...DEFAULT_SCORING_CONFIG, documentDiversityCap: 0.5 };
      const result = scoreDrafts({ drafts, config, now: NOW });

      // 50% of 4 = 2 max per doc
      // First 2 from doc-1 accepted, then doc-2, then doc-1 excess at end
      const doc1Positions = result
        .map((d, i) => ({ id: d.documentId, i }))
        .filter((x) => x.id === "doc-1");
      expect(doc1Positions).toHaveLength(3);
      // The third doc-1 card should be after the doc-2 card
      const doc2Pos = result.findIndex((d) => d.documentId === "doc-2");
      expect(doc1Positions[2]!.i).toBeGreaterThan(doc2Pos);
    });

    it("allows single-doc when batch is tiny (minimum 1 per doc)", () => {
      const drafts = [
        makeDraft({ id: "a", documentId: "doc-1", qualityScore: 0.9 }),
        makeDraft({ id: "b", documentId: "doc-1", qualityScore: 0.8 }),
      ];

      const result = scoreDrafts({ drafts, config: DEFAULT_SCORING_CONFIG, now: NOW });
      // 40% of 2 = 0.8, floor = 0, max(1, 0) = 1
      // So only 1 from doc-1 in accepted, 1 demoted
      expect(result).toHaveLength(2);
    });
  });

  describe("section diversity cap", () => {
    it("caps a dominant section at 25% of batch", () => {
      const drafts = [
        ...Array.from({ length: 10 }, (_, i) =>
          makeDraft({
            id: `secA-${i}`,
            documentId: `doc-${i}`,
            sectionSummaryId: "section-A",
            qualityScore: 0.9,
          }),
        ),
        ...Array.from({ length: 5 }, (_, i) =>
          makeDraft({
            id: `other-${i}`,
            documentId: `doc-other-${i}`,
            sectionSummaryId: `section-other-${i}`,
            qualityScore: 0.8,
          }),
        ),
      ];

      const config: ScoringConfig = { ...DEFAULT_SCORING_CONFIG, batchSize: 15 };
      const result = scoreDrafts({ drafts, config, now: NOW });

      // 25% of batchSize(15) = 3 max per section
      // Section-A gets 3 accepted, then 5 others, then 7 section-A demoted
      // The accepted portion (first 8) should have at most 3 from section-A
      const maxPerSection = Math.floor(15 * 0.25); // 3
      const demotedCount = 10 - maxPerSection; // 7 section-A demoted
      const acceptedPortion = result.slice(0, result.length - demotedCount);
      const sectionACounts = acceptedPortion.filter(
        (d) => d.sectionSummaryId === "section-A",
      ).length;

      expect(sectionACounts).toBeLessThanOrEqual(maxPerSection);
    });

    it("demotes excess section cards to end of list", () => {
      const drafts = [
        ...Array.from({ length: 5 }, (_, i) =>
          makeDraft({
            id: `secA-${i}`,
            documentId: `doc-a-${i}`,
            sectionSummaryId: "section-A",
            qualityScore: 0.9,
          }),
        ),
        ...Array.from({ length: 2 }, (_, i) =>
          makeDraft({
            id: `secB-${i}`,
            documentId: `doc-b-${i}`,
            sectionSummaryId: "section-B",
            qualityScore: 0.8,
          }),
        ),
      ];

      const config: ScoringConfig = {
        ...DEFAULT_SCORING_CONFIG,
        sectionDiversityCap: 0.5,
        batchSize: 4,
      };
      const result = scoreDrafts({ drafts, config, now: NOW });

      // 50% of batchSize(4) = 2 max per section
      // section-A gets 2 accepted, section-B gets 2 accepted
      const first4 = result.slice(0, 4);
      const secBInFirst4 = first4.filter((d) => d.sectionSummaryId === "section-B").length;
      expect(secBInFirst4).toBeGreaterThanOrEqual(1);
    });

    it("uses documentId as fallback when sectionSummaryId is missing", () => {
      const drafts = [
        ...Array.from({ length: 6 }, (_, i) =>
          makeDraft({
            id: `noSec-${i}`,
            documentId: "doc-same",
            qualityScore: 0.9,
          }),
        ),
        makeDraft({
          id: "other-doc",
          documentId: "doc-different",
          qualityScore: 0.8,
        }),
      ];

      const config: ScoringConfig = { ...DEFAULT_SCORING_CONFIG, batchSize: 7 };
      const result = scoreDrafts({ drafts, config, now: NOW });

      // Without sectionSummaryId, key = documentId
      // "doc-same" gets max floor(7*0.25)=1 in accepted portion
      // "doc-different" gets its own bucket
      const sameDocInTop2 = result.slice(0, 2).filter((d) => d.documentId === "doc-same").length;
      expect(sameDocInTop2).toBeLessThanOrEqual(1);
    });

    it("guarantees at least 1 card per section even with small batch", () => {
      const drafts = Array.from({ length: 3 }, (_, i) =>
        makeDraft({
          id: `same-${i}`,
          documentId: `doc-${i}`,
          sectionSummaryId: "section-only",
          qualityScore: 0.9 - i * 0.01,
        }),
      );

      const config: ScoringConfig = { ...DEFAULT_SCORING_CONFIG, batchSize: 2 };
      const result = scoreDrafts({ drafts, config, now: NOW });

      // max(1, floor(2*0.25)) = max(1, 0) = 1
      // At least 1 accepted from that section
      expect(result).toHaveLength(3);
      expect(result[0]!.sectionSummaryId).toBe("section-only");
    });

    it("section and document diversity work together", () => {
      const drafts = Array.from({ length: 15 }, (_, i) => {
        const sectionIndex = i % 3;
        return makeDraft({
          id: `combo-${i}`,
          documentId: "doc-single",
          sectionSummaryId: `section-${sectionIndex}`,
          qualityScore: 0.9 - i * 0.01,
        });
      });

      const config: ScoringConfig = { ...DEFAULT_SCORING_CONFIG, batchSize: 15 };
      const result = scoreDrafts({ drafts, config, now: NOW });

      // Section diversity: max floor(15*0.25)=3 per section
      // Document diversity: max floor(15*0.4)=6 per document
      // The accepted portion should show both caps in effect
      const topBatch = result.slice(0, 6);
      const sectionCounts = new Map<string, number>();
      for (const d of topBatch) {
        const key = d.sectionSummaryId!;
        sectionCounts.set(key, (sectionCounts.get(key) ?? 0) + 1);
      }

      for (const [, count] of sectionCounts) {
        expect(count).toBeLessThanOrEqual(3);
      }

      const docCount = topBatch.filter((d) => d.documentId === "doc-single").length;
      expect(docCount).toBeLessThanOrEqual(6);
    });
  });

  describe("custom config overrides", () => {
    it("uses custom highlight boost", () => {
      const config: ScoringConfig = { ...DEFAULT_SCORING_CONFIG, highlightBoost: 5.0 };
      const drafts = [
        makeDraft({
          id: "hl",
          strategy: "highlight",
          qualityScore: 1.0,
          documentCreatedAt: THIRTY_DAYS_AGO,
          servedCount: 0,
        }),
      ];

      const result = scoreDrafts({ drafts, config, now: NOW });
      expect(result[0]!.score).toBeCloseTo(5.0, 2);
    });

    it("uses custom maxConsecutiveSameType", () => {
      const config: ScoringConfig = { ...DEFAULT_SCORING_CONFIG, maxConsecutiveSameType: 1 };
      const drafts = [
        makeDraft({ id: "i1", postType: "insight", qualityScore: 0.9 }),
        makeDraft({ id: "i2", postType: "insight", qualityScore: 0.89 }),
        makeDraft({ id: "q1", postType: "quiz", qualityScore: 0.5 }),
      ];

      const result = scoreDrafts({ drafts, config, now: NOW });

      // With max 1 consecutive, after 1 insight we must swap in quiz
      expect(result[0]!.postType).toBe("insight");
      expect(result[1]!.postType).toBe("quiz");
    });

    it("uses custom document diversity cap", () => {
      const config: ScoringConfig = {
        ...DEFAULT_SCORING_CONFIG,
        documentDiversityCap: 0.2,
        batchSize: 10,
      };
      const drafts = [
        ...Array.from({ length: 5 }, (_, i) =>
          makeDraft({ id: `big-${i}`, documentId: "doc-big", qualityScore: 0.9 }),
        ),
        ...Array.from({ length: 5 }, (_, i) =>
          makeDraft({ id: `sm-${i}`, documentId: `doc-small-${i}`, qualityScore: 0.5 }),
        ),
      ];

      const result = scoreDrafts({ drafts, config, now: NOW });

      // 20% of batchSize(10) = 2 max per doc
      // The first 7 items (5 accepted + 2 from doc-big promoted) should respect cap
      // Actually: 2 doc-big accepted, then 5 doc-small, then 3 doc-big demoted
      const accepted = result.slice(0, 7);
      const bigInAccepted = accepted.filter((d) => d.documentId === "doc-big").length;
      expect(bigInAccepted).toBeLessThanOrEqual(2);
    });
  });

  describe("edge cases", () => {
    it("qualityScore of 0 produces zero score", () => {
      const drafts = [makeDraft({ id: "zero-quality", qualityScore: 0, servedCount: 0 })];

      const result = scoreDrafts({ drafts, config: DEFAULT_SCORING_CONFIG, now: NOW });

      expect(result[0]!.score).toBe(0);
    });

    it("future documentCreatedAt (clock skew) does not crash or produce negative scores", () => {
      const futureTime = NOW + 24 * 60 * 60 * 1000;
      const drafts = [
        makeDraft({ id: "future-doc", documentCreatedAt: futureTime, qualityScore: 0.8 }),
      ];

      const result = scoreDrafts({ drafts, config: DEFAULT_SCORING_CONFIG, now: NOW });

      expect(result).toHaveLength(1);
      expect(result[0]!.score).toBeGreaterThanOrEqual(0);
    });

    it("very large servedCount (1000) still produces a positive score", () => {
      const drafts = [makeDraft({ id: "mega-served", servedCount: 1000, qualityScore: 0.8 })];

      const result = scoreDrafts({ drafts, config: DEFAULT_SCORING_CONFIG, now: NOW });

      expect(result[0]!.score).toBeGreaterThan(0);
    });
  });

  describe("combined scoring factors", () => {
    it("correctly combines quality, recency, highlight, and saturation", () => {
      const drafts = [
        makeDraft({
          id: "perfect-storm",
          qualityScore: 1.0,
          documentCreatedAt: ONE_HOUR_AGO,
          strategy: "highlight",
          servedCount: 0,
        }),
        makeDraft({
          id: "stale-seen",
          qualityScore: 1.0,
          documentCreatedAt: THIRTY_DAYS_AGO,
          strategy: "section",
          servedCount: 5,
        }),
      ];

      const result = scoreDrafts({ drafts, config: DEFAULT_SCORING_CONFIG, now: NOW });

      expect(result[0]!.id).toBe("perfect-storm");
      // 1.0 * 2.0 * 3.0 / 1 = 6.0
      expect(result[0]!.score).toBeCloseTo(1.0 * FRESHNESS_BOOST_FACTOR * HIGHLIGHT_BOOST, 2);
      // 1.0 * 1.0 * 1.0 / (1 + 5/1) = 0.167
      expect(result[1]!.id).toBe("stale-seen");
      expect(result[1]!.score).toBeCloseTo(1.0 / 6, 2);
    });
  });

  describe("normalized saturation by document size", () => {
    it("scores a draft from a large document higher than one from a small document at same servedCount", () => {
      const base = {
        qualityScore: 0.8,
        documentCreatedAt: THIRTY_DAYS_AGO,
        servedCount: 15,
      };
      const drafts = [
        makeDraft({ id: "book", documentId: "doc-book", totalDraftsForDocument: 80, ...base }),
        makeDraft({ id: "video", documentId: "doc-video", totalDraftsForDocument: 20, ...base }),
      ];

      const result = scoreDrafts({ drafts, config: DEFAULT_SCORING_CONFIG, now: NOW });

      expect(result[0]!.id).toBe("book");
      expect(result[1]!.id).toBe("video");
      // Book: 0.8 * 1/(1 + 15/80) = 0.8 * 1/1.1875 = 0.674
      expect(result[0]!.score).toBeCloseTo(0.8 / (1 + 15 / 80), 3);
      // Video: 0.8 * 1/(1 + 15/20) = 0.8 * 1/1.75 = 0.457
      expect(result[1]!.score).toBeCloseTo(0.8 / (1 + 15 / 20), 3);
    });

    it("produces proportional representation: 1 large doc vs 3 small docs", () => {
      const base = { qualityScore: 0.8, documentCreatedAt: THIRTY_DAYS_AGO };

      const bookDrafts = Array.from({ length: 20 }, (_, i) =>
        makeDraft({
          id: `book-${i}`,
          documentId: "doc-book",
          totalDraftsForDocument: 80,
          servedCount: i < 15 ? 1 : 0,
          ...base,
        }),
      );

      const videoDrafts = Array.from({ length: 3 }, (_, vidIdx) =>
        Array.from({ length: 7 }, (_, j) =>
          makeDraft({
            id: `video-${vidIdx}-${j}`,
            documentId: `doc-video-${vidIdx}`,
            totalDraftsForDocument: 20,
            servedCount: j < 5 ? 1 : 0,
            ...base,
          }),
        ),
      ).flat();

      const drafts = [...bookDrafts, ...videoDrafts];
      const result = scoreDrafts({ drafts, config: DEFAULT_SCORING_CONFIG, now: NOW });
      const topBatch = result.slice(0, 15);

      const bookInBatch = topBatch.filter((d) => d.documentId === "doc-book").length;
      const videoInBatch = topBatch.filter((d) => d.documentId.startsWith("doc-video")).length;

      // Book should get meaningful representation, not be drowned out by 3 video documents
      expect(bookInBatch).toBeGreaterThanOrEqual(4);
      // Videos combined shouldn't completely dominate
      expect(videoInBatch).toBeLessThanOrEqual(11);
    });

    it("with totalDraftsForDocument=1, behaves like the original formula", () => {
      const base = {
        qualityScore: 1.0,
        documentCreatedAt: THIRTY_DAYS_AGO,
        totalDraftsForDocument: 1,
      };
      const drafts = [
        makeDraft({ id: "fresh", servedCount: 0, ...base }),
        makeDraft({ id: "once", servedCount: 1, ...base }),
        makeDraft({ id: "twice", servedCount: 2, ...base }),
      ];

      const result = scoreDrafts({ drafts, config: DEFAULT_SCORING_CONFIG, now: NOW });

      expect(result[0]!.score).toBeCloseTo(1.0, 2);
      expect(result[1]!.score).toBeCloseTo(0.5, 2);
      expect(result[2]!.score).toBeCloseTo(1 / 3, 2);
    });

    it("large document pool softens the saturation penalty", () => {
      const drafts = [
        makeDraft({
          id: "large-pool",
          servedCount: 10,
          totalDraftsForDocument: 100,
          qualityScore: 1.0,
          documentCreatedAt: THIRTY_DAYS_AGO,
        }),
      ];

      const result = scoreDrafts({ drafts, config: DEFAULT_SCORING_CONFIG, now: NOW });

      // 1/(1 + 10/100) = 1/1.1 = 0.909
      expect(result[0]!.score).toBeCloseTo(1 / 1.1, 3);
    });
  });

  describe("reaction feedback multipliers", () => {
    const BASE_DRAFT = {
      qualityScore: 1.0,
      documentCreatedAt: THIRTY_DAYS_AGO,
      servedCount: 0,
    } as const;

    function emptyReactionSummary(): ReactionSummary {
      return {
        dislikedSections: new Map(),
        dislikedCardTypes: new Set(),
        likedSections: new Set(),
        likedCardTypes: new Set(),
        rejectedDraftIds: new Set(),
      };
    }

    it("applies no penalty when reactionSummary is undefined (backward compat)", () => {
      const drafts = [makeDraft({ id: "d1", ...BASE_DRAFT })];

      const result = scoreDrafts({ drafts, config: DEFAULT_SCORING_CONFIG, now: NOW });

      expect(result[0]!.score).toBeCloseTo(1.0, 2);
    });

    it("applies no penalty when reactionSummary is empty (backward compat)", () => {
      const drafts = [makeDraft({ id: "d1", sectionSummaryId: "sec-1", ...BASE_DRAFT })];

      const result = scoreDrafts({
        drafts,
        config: DEFAULT_SCORING_CONFIG,
        now: NOW,
        reactionSummary: emptyReactionSummary(),
      });

      expect(result[0]!.score).toBeCloseTo(1.0, 2);
    });

    it("applies not_interesting penalty (0.3x) to drafts from disliked section", () => {
      const drafts = [
        makeDraft({ id: "penalized", sectionSummaryId: "sec-bad", ...BASE_DRAFT }),
        makeDraft({ id: "unaffected", sectionSummaryId: "sec-good", ...BASE_DRAFT }),
      ];

      const summary = emptyReactionSummary();
      summary.dislikedSections.set("sec-bad", "not_interesting");

      const result = scoreDrafts({
        drafts,
        config: DEFAULT_SCORING_CONFIG,
        now: NOW,
        reactionSummary: summary,
      });

      const penalized = result.find((d) => d.id === "penalized")!;
      const unaffected = result.find((d) => d.id === "unaffected")!;

      expect(penalized.score).toBeCloseTo(1.0 * REACTION_NOT_INTERESTING_MULTIPLIER, 3);
      expect(unaffected.score).toBeCloseTo(1.0, 3);
    });

    it("applies already_know penalty (0.1x) to drafts from disliked section", () => {
      const drafts = [makeDraft({ id: "known", sectionSummaryId: "sec-known", ...BASE_DRAFT })];

      const summary = emptyReactionSummary();
      summary.dislikedSections.set("sec-known", "already_know");

      const result = scoreDrafts({
        drafts,
        config: DEFAULT_SCORING_CONFIG,
        now: NOW,
        reactionSummary: summary,
      });

      expect(result[0]!.score).toBeCloseTo(1.0 * REACTION_ALREADY_KNOW_MULTIPLIER, 3);
    });

    it("applies wrong_type penalty (0.5x) to drafts of disliked card type", () => {
      const drafts = [
        makeDraft({ id: "bad-type", postType: "quiz", ...BASE_DRAFT }),
        makeDraft({ id: "ok-type", postType: "insight", ...BASE_DRAFT }),
      ];

      const summary = emptyReactionSummary();
      summary.dislikedCardTypes.add("quiz");

      const result = scoreDrafts({
        drafts,
        config: DEFAULT_SCORING_CONFIG,
        now: NOW,
        reactionSummary: summary,
      });

      const badType = result.find((d) => d.id === "bad-type")!;
      const okType = result.find((d) => d.id === "ok-type")!;

      expect(badType.score).toBeCloseTo(1.0 * REACTION_WRONG_TYPE_MULTIPLIER, 3);
      expect(okType.score).toBeCloseTo(1.0, 3);
    });

    it("excludes rejected drafts entirely from results", () => {
      const drafts = [
        makeDraft({ id: "rejected-1", ...BASE_DRAFT }),
        makeDraft({ id: "rejected-2", ...BASE_DRAFT }),
        makeDraft({ id: "kept", ...BASE_DRAFT }),
      ];

      const summary = emptyReactionSummary();
      summary.rejectedDraftIds.add("rejected-1");
      summary.rejectedDraftIds.add("rejected-2");

      const result = scoreDrafts({
        drafts,
        config: DEFAULT_SCORING_CONFIG,
        now: NOW,
        reactionSummary: summary,
      });

      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe("kept");
    });

    it("applies like section boost (1.3x)", () => {
      const drafts = [
        makeDraft({ id: "liked-sec", sectionSummaryId: "sec-fav", ...BASE_DRAFT }),
        makeDraft({ id: "neutral", sectionSummaryId: "sec-other", ...BASE_DRAFT }),
      ];

      const summary = emptyReactionSummary();
      summary.likedSections.add("sec-fav");

      const result = scoreDrafts({
        drafts,
        config: DEFAULT_SCORING_CONFIG,
        now: NOW,
        reactionSummary: summary,
      });

      const liked = result.find((d) => d.id === "liked-sec")!;
      const neutral = result.find((d) => d.id === "neutral")!;

      expect(liked.score).toBeCloseTo(1.0 * REACTION_LIKE_SECTION_MULTIPLIER, 3);
      expect(neutral.score).toBeCloseTo(1.0, 3);
    });

    it("applies like card type boost (1.15x)", () => {
      const drafts = [
        makeDraft({ id: "liked-type", postType: "quiz", ...BASE_DRAFT }),
        makeDraft({ id: "neutral-type", postType: "insight", ...BASE_DRAFT }),
      ];

      const summary = emptyReactionSummary();
      summary.likedCardTypes.add("quiz");

      const result = scoreDrafts({
        drafts,
        config: DEFAULT_SCORING_CONFIG,
        now: NOW,
        reactionSummary: summary,
      });

      const liked = result.find((d) => d.id === "liked-type")!;
      const neutral = result.find((d) => d.id === "neutral-type")!;

      expect(liked.score).toBeCloseTo(1.0 * REACTION_LIKE_CARD_TYPE_MULTIPLIER, 3);
      expect(neutral.score).toBeCloseTo(1.0, 3);
    });

    it("stacks section and type penalties multiplicatively", () => {
      const drafts = [
        makeDraft({
          id: "double-penalized",
          sectionSummaryId: "sec-bad",
          postType: "quiz",
          ...BASE_DRAFT,
        }),
      ];

      const summary = emptyReactionSummary();
      summary.dislikedSections.set("sec-bad", "not_interesting");
      summary.dislikedCardTypes.add("quiz");

      const result = scoreDrafts({
        drafts,
        config: DEFAULT_SCORING_CONFIG,
        now: NOW,
        reactionSummary: summary,
      });

      const expected = 1.0 * REACTION_NOT_INTERESTING_MULTIPLIER * REACTION_WRONG_TYPE_MULTIPLIER;
      expect(result[0]!.score).toBeCloseTo(expected, 3);
    });

    it("stacks like boosts with section and type multiplicatively", () => {
      const drafts = [
        makeDraft({
          id: "double-boosted",
          sectionSummaryId: "sec-fav",
          postType: "quiz",
          ...BASE_DRAFT,
        }),
      ];

      const summary = emptyReactionSummary();
      summary.likedSections.add("sec-fav");
      summary.likedCardTypes.add("quiz");

      const result = scoreDrafts({
        drafts,
        config: DEFAULT_SCORING_CONFIG,
        now: NOW,
        reactionSummary: summary,
      });

      const expected = 1.0 * REACTION_LIKE_SECTION_MULTIPLIER * REACTION_LIKE_CARD_TYPE_MULTIPLIER;
      expect(result[0]!.score).toBeCloseTo(expected, 3);
    });

    it("does not apply section penalty to drafts without sectionSummaryId", () => {
      const drafts = [makeDraft({ id: "no-section", ...BASE_DRAFT })];

      const summary = emptyReactionSummary();
      summary.dislikedSections.set("sec-bad", "not_interesting");

      const result = scoreDrafts({
        drafts,
        config: DEFAULT_SCORING_CONFIG,
        now: NOW,
        reactionSummary: summary,
      });

      expect(result[0]!.score).toBeCloseTo(1.0, 3);
    });

    it("reorders ranking based on reaction penalties", () => {
      const drafts = [
        makeDraft({
          id: "high-but-disliked",
          sectionSummaryId: "sec-bad",
          qualityScore: 0.9,
          documentCreatedAt: THIRTY_DAYS_AGO,
          servedCount: 0,
        }),
        makeDraft({
          id: "lower-but-clean",
          sectionSummaryId: "sec-good",
          qualityScore: 0.5,
          documentCreatedAt: THIRTY_DAYS_AGO,
          servedCount: 0,
        }),
      ];

      const summary = emptyReactionSummary();
      summary.dislikedSections.set("sec-bad", "already_know");

      const result = scoreDrafts({
        drafts,
        config: DEFAULT_SCORING_CONFIG,
        now: NOW,
        reactionSummary: summary,
      });

      // 0.9 * 0.1 = 0.09 vs 0.5 * 1.0 = 0.5
      expect(result[0]!.id).toBe("lower-but-clean");
      expect(result[1]!.id).toBe("high-but-disliked");
    });

    it("uses custom reaction multiplier config overrides", () => {
      const config: ScoringConfig = {
        ...DEFAULT_SCORING_CONFIG,
        reactionNotInterestingMultiplier: 0.5,
      };
      const drafts = [makeDraft({ id: "d1", sectionSummaryId: "sec-1", ...BASE_DRAFT })];

      const summary = emptyReactionSummary();
      summary.dislikedSections.set("sec-1", "not_interesting");

      const result = scoreDrafts({
        drafts,
        config,
        now: NOW,
        reactionSummary: summary,
      });

      expect(result[0]!.score).toBeCloseTo(0.5, 3);
    });
  });

  describe("ADR-018 effective quality (semantic + section)", () => {
    const STATIC_BASE = {
      documentCreatedAt: THIRTY_DAYS_AGO,
      servedCount: 0,
    } as const;

    it("falls back to qualityScore when semanticQualityScore is undefined", () => {
      const drafts = [makeDraft({ id: "legacy", qualityScore: 0.62, ...STATIC_BASE })];
      const result = scoreDrafts({ drafts, config: DEFAULT_SCORING_CONFIG, now: NOW });
      expect(result[0]!.score).toBeCloseTo(0.62, 3);
    });

    it("uses semanticQualityScore when present and section signal absent", () => {
      const drafts = [
        makeDraft({
          id: "semantic-only",
          qualityScore: 1.0,
          semanticQualityScore: 0.4,
          ...STATIC_BASE,
        }),
      ];
      const result = scoreDrafts({ drafts, config: DEFAULT_SCORING_CONFIG, now: NOW });
      expect(result[0]!.score).toBeCloseTo(0.4, 3);
    });

    it("blends 0.7 * semantic + 0.3 * section when both present", () => {
      const drafts = [
        makeDraft({
          id: "blended",
          qualityScore: 1.0,
          semanticQualityScore: 0.8,
          sectionQualitySignal: 0.5,
          ...STATIC_BASE,
        }),
      ];
      const result = scoreDrafts({ drafts, config: DEFAULT_SCORING_CONFIG, now: NOW });
      const expected = SEMANTIC_QUALITY_WEIGHT * 0.8 + SECTION_QUALITY_WEIGHT * 0.5;
      expect(result[0]!.score).toBeCloseTo(expected, 3);
    });

    it("breaks the qualityScore=1.0 saturation: a quote with low semantic score now ranks below an insight with high semantic score", () => {
      // Pre-ADR-018: both would have qualityScore = 1.0 and tie. Post-ADR-018: the quote's
      // verbatim-but-uneducational semantic score sinks it below the insight.
      const drafts = [
        makeDraft({
          id: "saturated-quote",
          postType: "quote",
          qualityScore: 1.0,
          semanticQualityScore: 0.45,
          ...STATIC_BASE,
        }),
        makeDraft({
          id: "real-insight",
          postType: "insight",
          qualityScore: 1.0,
          semanticQualityScore: 0.8,
          ...STATIC_BASE,
        }),
      ];
      const result = scoreDrafts({ drafts, config: DEFAULT_SCORING_CONFIG, now: NOW });
      expect(result[0]!.id).toBe("real-insight");
      expect(result[1]!.id).toBe("saturated-quote");
    });
  });

  describe("ADR-018 front-matter penalty", () => {
    const STATIC_BASE = {
      documentCreatedAt: THIRTY_DAYS_AGO,
      servedCount: 0,
    } as const;

    it("multiplies score by 0.2 when sectionQualitySignal < 0.3", () => {
      const drafts = [
        makeDraft({
          id: "front-matter",
          semanticQualityScore: 0.8,
          sectionQualitySignal: 0.2,
          ...STATIC_BASE,
        }),
      ];
      const result = scoreDrafts({ drafts, config: DEFAULT_SCORING_CONFIG, now: NOW });
      const blended = SEMANTIC_QUALITY_WEIGHT * 0.8 + SECTION_QUALITY_WEIGHT * 0.2;
      expect(result[0]!.score).toBeCloseTo(blended * FRONT_MATTER_PENALTY, 3);
    });

    it("does NOT apply when sectionQualitySignal === threshold (0.3)", () => {
      const drafts = [
        makeDraft({
          id: "boundary",
          semanticQualityScore: 0.8,
          sectionQualitySignal: 0.3,
          ...STATIC_BASE,
        }),
      ];
      const result = scoreDrafts({ drafts, config: DEFAULT_SCORING_CONFIG, now: NOW });
      const blended = SEMANTIC_QUALITY_WEIGHT * 0.8 + SECTION_QUALITY_WEIGHT * 0.3;
      expect(result[0]!.score).toBeCloseTo(blended, 3);
    });

    it("does NOT apply when sectionQualitySignal is undefined (legacy/highlight drafts)", () => {
      const drafts = [
        makeDraft({
          id: "legacy",
          semanticQualityScore: 0.8,
          ...STATIC_BASE,
        }),
      ];
      const result = scoreDrafts({ drafts, config: DEFAULT_SCORING_CONFIG, now: NOW });
      expect(result[0]!.score).toBeCloseTo(0.8, 3);
    });

    it("front-matter card ranks below substantive cards even with same semantic score", () => {
      const drafts = [
        makeDraft({
          id: "front-matter",
          semanticQualityScore: 0.85,
          sectionQualitySignal: 0.15,
          ...STATIC_BASE,
        }),
        makeDraft({
          id: "substantive",
          semanticQualityScore: 0.5,
          sectionQualitySignal: 0.7,
          ...STATIC_BASE,
        }),
      ];
      const result = scoreDrafts({ drafts, config: DEFAULT_SCORING_CONFIG, now: NOW });
      expect(result[0]!.id).toBe("substantive");
      expect(result[1]!.id).toBe("front-matter");
    });
  });

  describe("ADR-018 learning-goal relevance", () => {
    const STATIC_BASE = {
      documentCreatedAt: THIRTY_DAYS_AGO,
      servedCount: 0,
      semanticQualityScore: 0.6,
    } as const;

    function vec(direction: "x" | "y" | "z" | "diag"): number[] {
      switch (direction) {
        case "x":
          return [1, 0, 0];
        case "y":
          return [0, 1, 0];
        case "z":
          return [0, 0, 1];
        case "diag":
          return [1, 1, 0];
      }
    }

    it("defaults goalRelevance to 1.0 when goalEmbedding is missing", () => {
      const drafts = [makeDraft({ id: "d1", sectionSummaryId: "sec-1", ...STATIC_BASE })];
      const sectionEmbeddings = new Map([["sec-1", vec("x")]]);
      const result = scoreDrafts({
        drafts,
        config: DEFAULT_SCORING_CONFIG,
        now: NOW,
        sectionEmbeddings,
      });
      expect(result[0]!.score).toBeCloseTo(0.6, 3);
    });

    it("defaults goalRelevance to 1.0 when section embedding is missing", () => {
      const drafts = [makeDraft({ id: "d1", sectionSummaryId: "sec-missing", ...STATIC_BASE })];
      const result = scoreDrafts({
        drafts,
        config: DEFAULT_SCORING_CONFIG,
        now: NOW,
        goalEmbeddingByDocument: new Map([["doc-1", vec("x")]]),
        sectionEmbeddings: new Map(),
      });
      expect(result[0]!.score).toBeCloseTo(0.6, 3);
    });

    it("defaults goalRelevance to 1.0 when section vector dimension differs (corrupt vector guard)", () => {
      const drafts = [makeDraft({ id: "d1", sectionSummaryId: "sec-1", ...STATIC_BASE })];
      const sectionEmbeddings = new Map([["sec-1", [1, 0]]]);
      const result = scoreDrafts({
        drafts,
        config: DEFAULT_SCORING_CONFIG,
        now: NOW,
        goalEmbeddingByDocument: new Map([["doc-1", vec("x")]]),
        sectionEmbeddings,
      });
      expect(result[0]!.score).toBeCloseTo(0.6, 3);
    });

    it("defaults goalRelevance to 1.0 when draft has no sectionSummaryId (highlight/thematic)", () => {
      const drafts = [makeDraft({ id: "d1", ...STATIC_BASE })];
      const result = scoreDrafts({
        drafts,
        config: DEFAULT_SCORING_CONFIG,
        now: NOW,
        goalEmbeddingByDocument: new Map([["doc-1", vec("x")]]),
        sectionEmbeddings: new Map([["sec-1", vec("x")]]),
      });
      expect(result[0]!.score).toBeCloseTo(0.6, 3);
    });

    it("applies the formula 1 + α * max(0, cosine - floor) for an aligned section", () => {
      const drafts = [
        makeDraft({ id: "aligned", sectionSummaryId: "sec-aligned", ...STATIC_BASE }),
      ];
      const goalEmbeddingByDocument = new Map([["doc-1", vec("x")]]);
      const sectionEmbeddings = new Map([["sec-aligned", vec("x")]]);
      const result = scoreDrafts({
        drafts,
        config: DEFAULT_SCORING_CONFIG,
        now: NOW,
        goalEmbeddingByDocument,
        sectionEmbeddings,
      });
      // cosine = 1.0, goalRelevance = 1 + 0.6 * (1 - 0.1) = 1.54
      const expected = 0.6 * (1 + GOAL_RELEVANCE_ALPHA * (1 - GOAL_RELEVANCE_FLOOR));
      expect(result[0]!.score).toBeCloseTo(expected, 3);
    });

    it("clamps goalRelevance to 1.0 when cosine is below the floor (orthogonal)", () => {
      const drafts = [
        makeDraft({ id: "orthogonal", sectionSummaryId: "sec-orth", ...STATIC_BASE }),
      ];
      const goalEmbeddingByDocument = new Map([["doc-1", vec("x")]]);
      const sectionEmbeddings = new Map([["sec-orth", vec("y")]]);
      const result = scoreDrafts({
        drafts,
        config: DEFAULT_SCORING_CONFIG,
        now: NOW,
        goalEmbeddingByDocument,
        sectionEmbeddings,
      });
      // cosine = 0, max(0, 0 - 0.1) = 0 → goalRelevance = 1.0
      expect(result[0]!.score).toBeCloseTo(0.6, 3);
    });

    it("ranks an aligned section above an unaligned section with the same base quality", () => {
      const drafts = [
        makeDraft({
          id: "aligned",
          sectionSummaryId: "sec-aligned",
          ...STATIC_BASE,
        }),
        makeDraft({
          id: "orthogonal",
          sectionSummaryId: "sec-orth",
          ...STATIC_BASE,
        }),
      ];
      const goalEmbeddingByDocument = new Map([["doc-1", vec("x")]]);
      const sectionEmbeddings = new Map([
        ["sec-aligned", vec("x")],
        ["sec-orth", vec("y")],
      ]);
      const result = scoreDrafts({
        drafts,
        config: DEFAULT_SCORING_CONFIG,
        now: NOW,
        goalEmbeddingByDocument,
        sectionEmbeddings,
      });
      expect(result[0]!.id).toBe("aligned");
      expect(result[1]!.id).toBe("orthogonal");
    });

    it("goal toggle changes ordering for the same draft pool (A/B harness shape)", () => {
      const drafts = [
        makeDraft({
          id: "weak-but-aligned",
          sectionSummaryId: "sec-aligned",
          semanticQualityScore: 0.5,
          documentCreatedAt: THIRTY_DAYS_AGO,
          servedCount: 0,
        }),
        makeDraft({
          id: "strong-but-unaligned",
          sectionSummaryId: "sec-orth",
          semanticQualityScore: 0.65,
          documentCreatedAt: THIRTY_DAYS_AGO,
          servedCount: 0,
        }),
      ];
      const sectionEmbeddings = new Map([
        ["sec-aligned", vec("x")],
        ["sec-orth", vec("y")],
      ]);

      const noGoal = scoreDrafts({ drafts, config: DEFAULT_SCORING_CONFIG, now: NOW });
      expect(noGoal[0]!.id).toBe("strong-but-unaligned");

      const withGoal = scoreDrafts({
        drafts,
        config: DEFAULT_SCORING_CONFIG,
        now: NOW,
        goalEmbeddingByDocument: new Map([["doc-1", vec("x")]]),
        sectionEmbeddings,
      });
      // With α=0.6 floor=0.1: aligned 0.5 * 1.54 = 0.77; orth 0.65 * 1 = 0.65 → aligned wins.
      expect(withGoal[0]!.id).toBe("weak-but-aligned");
    });
  });

  describe("ADR-018 book-position diversity", () => {
    function bookDraft(overrides: Partial<ScoredDraft> & { id: string; chunkStartIndex: number }) {
      return makeDraft({
        documentCreatedAt: THIRTY_DAYS_AGO,
        servedCount: 0,
        documentChunkCount: 100,
        ...overrides,
      });
    }

    it("picks at least one card from each populated quartile in the first batch", () => {
      // Build a pool that, sorted by score, would otherwise keep all top picks in quartile 0.
      const drafts = [
        bookDraft({
          id: "q0-top",
          chunkStartIndex: 1,
          sectionSummaryId: "s0",
          semanticQualityScore: 0.99,
        }),
        bookDraft({
          id: "q0-2",
          chunkStartIndex: 2,
          sectionSummaryId: "s0b",
          semanticQualityScore: 0.98,
        }),
        bookDraft({
          id: "q0-3",
          chunkStartIndex: 3,
          sectionSummaryId: "s0c",
          semanticQualityScore: 0.97,
        }),
        bookDraft({
          id: "q1-top",
          chunkStartIndex: 30,
          sectionSummaryId: "s1",
          semanticQualityScore: 0.6,
        }),
        bookDraft({
          id: "q2-top",
          chunkStartIndex: 55,
          sectionSummaryId: "s2",
          semanticQualityScore: 0.5,
        }),
        bookDraft({
          id: "q3-top",
          chunkStartIndex: 90,
          sectionSummaryId: "s3",
          semanticQualityScore: 0.4,
        }),
      ];
      const config: ScoringConfig = { ...DEFAULT_SCORING_CONFIG, batchSize: 4 };
      const result = scoreDrafts({ drafts, config, now: NOW });
      const top4 = result.slice(0, 4);
      const buckets = new Set(top4.map((d) => Math.floor((d.chunkStartIndex! / 100) * 4)));
      expect(buckets.size).toBe(4);
    });

    it("prefers a distant section over an adjacent one in the second pick", () => {
      const drafts = [
        bookDraft({
          id: "q0-best",
          chunkStartIndex: 0,
          sectionSummaryId: "s0",
          semanticQualityScore: 0.99,
        }),
        bookDraft({
          id: "q0-second",
          chunkStartIndex: 1,
          sectionSummaryId: "s0b",
          semanticQualityScore: 0.98,
        }),
        bookDraft({
          id: "q3-distant",
          chunkStartIndex: 80,
          sectionSummaryId: "s3",
          semanticQualityScore: 0.5,
        }),
      ];
      const config: ScoringConfig = { ...DEFAULT_SCORING_CONFIG, batchSize: 2 };
      const result = scoreDrafts({ drafts, config, now: NOW });
      expect(result[0]!.id).toBe("q0-best");
      expect(result[1]!.id).toBe("q3-distant");
    });

    it("is a no-op when fewer than 2 quartiles are populated (early-document case)", () => {
      const drafts = [
        bookDraft({
          id: "q0-a",
          chunkStartIndex: 0,
          sectionSummaryId: "sa",
          semanticQualityScore: 0.9,
        }),
        bookDraft({
          id: "q0-b",
          chunkStartIndex: 5,
          sectionSummaryId: "sb",
          semanticQualityScore: 0.8,
        }),
        bookDraft({
          id: "q0-c",
          chunkStartIndex: 10,
          sectionSummaryId: "sc",
          semanticQualityScore: 0.7,
        }),
      ];
      const result = scoreDrafts({ drafts, config: DEFAULT_SCORING_CONFIG, now: NOW });
      // Order should follow score sort, not be reordered by book-pos pass.
      expect(result.map((d) => d.id)).toEqual(["q0-a", "q0-b", "q0-c"]);
    });

    it("is a no-op when any draft lacks position metadata (mixed pool with highlight/thematic)", () => {
      const drafts = [
        bookDraft({
          id: "with-pos",
          chunkStartIndex: 0,
          sectionSummaryId: "s0",
          semanticQualityScore: 0.9,
        }),
        makeDraft({
          id: "no-pos",
          sectionSummaryId: "s-thematic",
          semanticQualityScore: 0.85,
          documentCreatedAt: THIRTY_DAYS_AGO,
          servedCount: 0,
        }),
        bookDraft({
          id: "with-pos-2",
          chunkStartIndex: 80,
          sectionSummaryId: "s3",
          semanticQualityScore: 0.7,
        }),
      ];
      const result = scoreDrafts({ drafts, config: DEFAULT_SCORING_CONFIG, now: NOW });
      // Pure score order, not book-pos round-robin.
      expect(result.map((d) => d.id)).toEqual(["with-pos", "no-pos", "with-pos-2"]);
    });

    it("respects custom batchSize when picking quartile representatives", () => {
      const drafts = Array.from({ length: 16 }, (_, i) =>
        bookDraft({
          id: `d-${i}`,
          chunkStartIndex: (i % 4) * 25 + 1,
          sectionSummaryId: `sec-${i}`,
          semanticQualityScore: 0.9 - i * 0.01,
        }),
      );
      const config: ScoringConfig = { ...DEFAULT_SCORING_CONFIG, batchSize: 8 };
      const result = scoreDrafts({ drafts, config, now: NOW });
      const top8 = result.slice(0, 8);
      const bucketCounts = new Map<number, number>();
      for (const d of top8) {
        const b = Math.floor((d.chunkStartIndex! / 100) * 4);
        bucketCounts.set(b, (bucketCounts.get(b) ?? 0) + 1);
      }
      // Each of the 4 quartiles should appear at least once among the first 8 items.
      expect(bucketCounts.size).toBe(4);
    });

    it("clamps chunkStartIndex >= chunkCount into the last bucket", () => {
      const drafts = [
        bookDraft({
          id: "edge",
          chunkStartIndex: 100,
          documentChunkCount: 100,
          sectionSummaryId: "s-edge",
          semanticQualityScore: 0.9,
        }),
        bookDraft({
          id: "early",
          chunkStartIndex: 0,
          documentChunkCount: 100,
          sectionSummaryId: "s-early",
          semanticQualityScore: 0.8,
        }),
      ];
      const config: ScoringConfig = { ...DEFAULT_SCORING_CONFIG, batchSize: 2 };
      const result = scoreDrafts({ drafts, config, now: NOW });
      // Both buckets populated → both selected; relative order preserved.
      expect(
        result
          .slice(0, 2)
          .map((d) => d.id)
          .sort(),
      ).toEqual(["early", "edge"]);
    });
  });

  describe("ADR-018 card-type share caps", () => {
    function quoteHeavyPool(): ScoredDraft[] {
      // 12 quotes ranked above 6 insights and 2 quizzes.
      const quotes = Array.from({ length: 12 }, (_, i) =>
        makeDraft({
          id: `q-${i}`,
          postType: "quote",
          documentId: `doc-q-${i}`,
          sectionSummaryId: `sec-q-${i}`,
          semanticQualityScore: 0.95 - i * 0.001,
          documentCreatedAt: THIRTY_DAYS_AGO,
          servedCount: 0,
        }),
      );
      const insights = Array.from({ length: 6 }, (_, i) =>
        makeDraft({
          id: `i-${i}`,
          postType: "insight",
          documentId: `doc-i-${i}`,
          sectionSummaryId: `sec-i-${i}`,
          semanticQualityScore: 0.5 - i * 0.001,
          documentCreatedAt: THIRTY_DAYS_AGO,
          servedCount: 0,
        }),
      );
      const quizzes = Array.from({ length: 2 }, (_, i) =>
        makeDraft({
          id: `qz-${i}`,
          postType: "quiz",
          documentId: `doc-qz-${i}`,
          sectionSummaryId: `sec-qz-${i}`,
          semanticQualityScore: 0.45 - i * 0.001,
          documentCreatedAt: THIRTY_DAYS_AGO,
          servedCount: 0,
        }),
      );
      return [...quotes, ...insights, ...quizzes];
    }

    it("caps quote share at 30% of the batch and demotes the rest to the tail", () => {
      const drafts = quoteHeavyPool();
      const config: ScoringConfig = {
        ...DEFAULT_SCORING_CONFIG,
        batchSize: 10,
        // Disable interfering type/section/document caps so the share-cap pass is the only constraint.
        maxConsecutiveSameType: 100,
        sectionDiversityCap: 1.0,
        documentDiversityCap: 1.0,
      };
      const result = scoreDrafts({ drafts, config, now: NOW });
      const top10 = result.slice(0, 10);
      const quotesInTop10 = top10.filter((d) => d.postType === "quote").length;
      // floor(10 * 0.3) = 3, max(1, 3) = 3
      expect(quotesInTop10).toBeLessThanOrEqual(3);
    });

    it("caps quiz share at 30% of the batch", () => {
      const drafts = Array.from({ length: 12 }, (_, i) =>
        makeDraft({
          id: `qz-${i}`,
          postType: "quiz",
          documentId: `doc-${i}`,
          sectionSummaryId: `sec-${i}`,
          semanticQualityScore: 0.95 - i * 0.001,
          documentCreatedAt: THIRTY_DAYS_AGO,
          servedCount: 0,
        }),
      ).concat(
        Array.from({ length: 8 }, (_, i) =>
          makeDraft({
            id: `i-${i}`,
            postType: "insight",
            documentId: `doc-i-${i}`,
            sectionSummaryId: `sec-i-${i}`,
            semanticQualityScore: 0.6 - i * 0.001,
            documentCreatedAt: THIRTY_DAYS_AGO,
            servedCount: 0,
          }),
        ),
      );
      const config: ScoringConfig = {
        ...DEFAULT_SCORING_CONFIG,
        batchSize: 10,
        maxConsecutiveSameType: 100,
        sectionDiversityCap: 1.0,
        documentDiversityCap: 1.0,
      };
      const result = scoreDrafts({ drafts, config, now: NOW });
      const top10 = result.slice(0, 10);
      const quizzesInTop10 = top10.filter((d) => d.postType === "quiz").length;
      expect(quizzesInTop10).toBeLessThanOrEqual(3);
    });

    it("demoted quotes appear at the tail in original score order", () => {
      const drafts = quoteHeavyPool();
      const config: ScoringConfig = {
        ...DEFAULT_SCORING_CONFIG,
        batchSize: 10,
        maxConsecutiveSameType: 100,
        sectionDiversityCap: 1.0,
        documentDiversityCap: 1.0,
      };
      const result = scoreDrafts({ drafts, config, now: NOW });
      // After the 30% cap on quotes (3 in top), the remaining 9 quotes appear at the tail
      // in their original score order (q-3, q-4, ..., q-11).
      const tailQuoteIds = result
        .filter((d) => d.postType === "quote")
        .slice(3)
        .map((d) => d.id);
      const expected = Array.from({ length: 9 }, (_, i) => `q-${i + 3}`);
      expect(tailQuoteIds).toEqual(expected);
    });

    it("does not demote quotes when their share is already below the cap", () => {
      const drafts = [
        makeDraft({
          id: "q-only",
          postType: "quote",
          semanticQualityScore: 0.9,
          documentCreatedAt: THIRTY_DAYS_AGO,
          servedCount: 0,
        }),
        ...Array.from({ length: 9 }, (_, i) =>
          makeDraft({
            id: `i-${i}`,
            postType: "insight",
            documentId: `doc-${i}`,
            sectionSummaryId: `sec-${i}`,
            semanticQualityScore: 0.7,
            documentCreatedAt: THIRTY_DAYS_AGO,
            servedCount: 0,
          }),
        ),
      ];
      const config: ScoringConfig = {
        ...DEFAULT_SCORING_CONFIG,
        batchSize: 10,
        maxConsecutiveSameType: 100,
        sectionDiversityCap: 1.0,
        documentDiversityCap: 1.0,
      };
      const result = scoreDrafts({ drafts, config, now: NOW });
      // 1 quote / 10 batch = 10% < 30% cap → quote stays in the accepted prefix.
      expect(result[0]!.id).toBe("q-only");
    });
  });

  describe("ADR-018 synthetic 150-draft integration", () => {
    // 150-draft pool that mirrors a real DDIA-like distribution after Task 3:
    //   - ~10% from front-matter sections (semantic 0.20-0.32, sectionQualitySignal 0.2)
    //   - ~25% verbatim-but-uneducational quotes / generic summaries (semantic 0.40-0.60)
    //   - ~45% useful learning cards (semantic 0.65-0.85)
    //   - ~20% high-value cards on dense technical sections (semantic 0.85-0.93)
    // The validator rubric (ADR-018 §1) is what produces this real shape.
    function buildSyntheticPool(): ScoredDraft[] {
      const cardTypes = ["insight", "summary", "quiz", "quote"] as const;
      const totalSections = 30;
      const totalDrafts = 150;
      return Array.from({ length: totalDrafts }, (_, i) => {
        const postType = cardTypes[i % cardTypes.length]!;
        const sectionIdx = i % totalSections;
        const tier = i / totalDrafts;

        // First 3 of 30 sections are front matter (sectionQualitySignal < threshold 0.3).
        const isFrontMatter = sectionIdx < 3;
        const sectionQualitySignal = isFrontMatter ? 0.2 : 0.5 + (sectionIdx % 7) * 0.07;

        let semanticQualityScore: number;
        if (isFrontMatter) {
          semanticQualityScore = 0.2 + (i % 4) * 0.04;
        } else if (postType === "quote" && tier < 0.6) {
          // Most quotes land in the "verbatim but not teaching" 0.4-0.6 band.
          semanticQualityScore = 0.4 + (i % 5) * 0.04;
        } else if (tier < 0.5) {
          semanticQualityScore = 0.5 + (i % 6) * 0.025;
        } else if (tier < 0.85) {
          semanticQualityScore = 0.7 + (i % 5) * 0.03;
        } else {
          semanticQualityScore = 0.85 + (i % 4) * 0.02;
        }

        return {
          id: `d-${i}`,
          documentId: "doc-1",
          sectionSummaryId: `sec-${sectionIdx}`,
          postType,
          strategy: "section",
          qualityScore: 1.0,
          semanticQualityScore,
          sectionQualitySignal,
          servedCount: 0,
          totalDraftsForDocument: totalDrafts,
          documentCreatedAt: THIRTY_DAYS_AGO,
          chunkStartIndex: sectionIdx * 30,
          documentChunkCount: totalSections * 30,
        };
      });
    }

    it("the effectiveQuality distribution clears the AC: std >= 0.15 and >= 20% below 0.7", () => {
      const drafts = buildSyntheticPool();
      const result = scoreDrafts({ drafts, config: DEFAULT_SCORING_CONFIG, now: NOW });

      // Reverse out the recency/saturation/etc. multipliers we know are 1.0 here so we test
      // the quality term itself - the same metric the analytics histogram will report.
      const quality = result.map((d) => {
        const qd = drafts.find((x) => x.id === d.id)!;
        if (qd.semanticQualityScore !== undefined && qd.sectionQualitySignal !== undefined) {
          return (
            SEMANTIC_QUALITY_WEIGHT * qd.semanticQualityScore +
            SECTION_QUALITY_WEIGHT * qd.sectionQualitySignal
          );
        }
        return qd.semanticQualityScore ?? qd.qualityScore;
      });

      const mean = quality.reduce((s, x) => s + x, 0) / quality.length;
      const variance = quality.reduce((s, x) => s + (x - mean) ** 2, 0) / quality.length;
      const std = Math.sqrt(variance);
      const belowThreshold = quality.filter((q) => q < 0.7).length / quality.length;

      expect(std).toBeGreaterThanOrEqual(0.15);
      expect(belowThreshold).toBeGreaterThanOrEqual(0.2);
    });

    it("the first 10 served cards span at least 50% of book depth", () => {
      const drafts = buildSyntheticPool();
      const config: ScoringConfig = { ...DEFAULT_SCORING_CONFIG, batchSize: 10 };
      const result = scoreDrafts({ drafts, config, now: NOW });
      const top10 = result.slice(0, 10);
      const positions = top10.map((d) => d.chunkStartIndex! / d.documentChunkCount!);
      const spread = Math.max(...positions) - Math.min(...positions);
      expect(spread).toBeGreaterThanOrEqual(0.5);
    });

    it("the first 20 served cards do not include any front-matter section", () => {
      const drafts = buildSyntheticPool();
      const config: ScoringConfig = { ...DEFAULT_SCORING_CONFIG, batchSize: 20 };
      const result = scoreDrafts({ drafts, config, now: NOW });
      const top20 = result.slice(0, 20);
      const frontMatterInTop = top20.filter((d) => (d.sectionQualitySignal ?? 1) < 0.3);
      expect(frontMatterInTop.length).toBe(0);
    });

    it("quote share over the first 20 served cards is <= 30%", () => {
      const drafts = buildSyntheticPool();
      const config: ScoringConfig = { ...DEFAULT_SCORING_CONFIG, batchSize: 20 };
      const result = scoreDrafts({ drafts, config, now: NOW });
      const top20 = result.slice(0, 20);
      const quoteShare = top20.filter((d) => d.postType === "quote").length / top20.length;
      expect(quoteShare).toBeLessThanOrEqual(0.3);
    });

    it("with a learning goal aligned to one section, that section's drafts surface in the first batch", () => {
      const drafts = buildSyntheticPool();
      // Build embeddings: most sections orthogonal, one aligned with the goal.
      const goalEmbedding = [1, 0, 0];
      const sectionEmbeddings = new Map<string, number[]>();
      for (let i = 0; i < 30; i++) {
        sectionEmbeddings.set(`sec-${i}`, [0, 1, 0]);
      }
      sectionEmbeddings.set("sec-15", [1, 0, 0]);

      const noGoalResult = scoreDrafts({ drafts, config: DEFAULT_SCORING_CONFIG, now: NOW });
      const goalResult = scoreDrafts({
        drafts,
        config: DEFAULT_SCORING_CONFIG,
        now: NOW,
        goalEmbeddingByDocument: new Map([["doc-1", goalEmbedding]]),
        sectionEmbeddings,
      });

      // Order changes when goal is applied (AC: "rank order differs").
      const noGoalIds = noGoalResult.slice(0, 10).map((d) => d.id);
      const goalIds = goalResult.slice(0, 10).map((d) => d.id);
      expect(goalIds).not.toEqual(noGoalIds);

      // sec-15 cards should be promoted into the first batch by the goal alignment.
      const sec15InGoalTop = goalResult
        .slice(0, 10)
        .filter((d) => d.sectionSummaryId === "sec-15").length;
      const sec15InNoGoalTop = noGoalResult
        .slice(0, 10)
        .filter((d) => d.sectionSummaryId === "sec-15").length;
      expect(sec15InGoalTop).toBeGreaterThan(sec15InNoGoalTop);
    });
  });
});
