import { describe, expect, it } from "vitest";

import {
  FRESHNESS_BOOST_FACTOR,
  FRESHNESS_DECAY_WINDOW_MS,
  FRESHNESS_WINDOW_MS,
  HIGHLIGHT_BOOST,
} from "../constants";
import {
  DEFAULT_SCORING_CONFIG,
  scoreDrafts,
  type ScoredDraft,
  type ScoringConfig,
} from "../scoring";

const NOW = Date.now();
const ONE_HOUR_AGO = NOW - 60 * 60 * 1000;
const THREE_DAYS_AGO = NOW - 3 * 24 * 60 * 60 * 1000;
const THIRTY_DAYS_AGO = NOW - 30 * 24 * 60 * 60 * 1000;

function makeDraft(overrides: Partial<ScoredDraft> = {}): ScoredDraft {
  return {
    id: `draft-${Math.random().toString(36).slice(2, 8)}`,
    documentId: "doc-1",
    cardType: "insight",
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
        makeDraft({ id: "i1", cardType: "insight", qualityScore: 0.9 }),
        makeDraft({ id: "i2", cardType: "insight", qualityScore: 0.88 }),
        makeDraft({ id: "i3", cardType: "insight", qualityScore: 0.87 }),
        makeDraft({ id: "i4", cardType: "insight", qualityScore: 0.86 }),
        makeDraft({ id: "q1", cardType: "quiz", qualityScore: 0.5 }),
      ];

      const result = scoreDrafts({ drafts, config: DEFAULT_SCORING_CONFIG, now: NOW });

      let maxConsecutive = 1;
      let current = 1;
      for (let i = 1; i < result.length; i++) {
        if (result[i]!.cardType === result[i - 1]!.cardType) {
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
        makeDraft({ id: `i-${i}`, cardType: "insight", qualityScore: 0.9 - i * 0.01 }),
      );

      const result = scoreDrafts({ drafts, config: DEFAULT_SCORING_CONFIG, now: NOW });

      expect(result).toHaveLength(6);
      expect(result.every((d) => d.cardType === "insight")).toBe(true);
    });

    it("swaps in the first different-type card when limit exceeded", () => {
      const drafts = [
        makeDraft({ id: "i1", cardType: "insight", qualityScore: 0.99 }),
        makeDraft({ id: "i2", cardType: "insight", qualityScore: 0.98 }),
        makeDraft({ id: "i3", cardType: "insight", qualityScore: 0.97 }),
        makeDraft({ id: "q1", cardType: "quiz", qualityScore: 0.2 }),
        makeDraft({ id: "i4", cardType: "insight", qualityScore: 0.96 }),
      ];

      const result = scoreDrafts({ drafts, config: DEFAULT_SCORING_CONFIG, now: NOW });

      // After 3 insights, the quiz should be swapped in before the 4th insight
      expect(result[3]!.cardType).toBe("quiz");
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
        makeDraft({ id: "i1", cardType: "insight", qualityScore: 0.9 }),
        makeDraft({ id: "i2", cardType: "insight", qualityScore: 0.89 }),
        makeDraft({ id: "q1", cardType: "quiz", qualityScore: 0.5 }),
      ];

      const result = scoreDrafts({ drafts, config, now: NOW });

      // With max 1 consecutive, after 1 insight we must swap in quiz
      expect(result[0]!.cardType).toBe("insight");
      expect(result[1]!.cardType).toBe("quiz");
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
});
