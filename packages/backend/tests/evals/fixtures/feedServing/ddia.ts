import type { FeedServingFixture, FixturePostType, FixtureDraft } from "./types";

/**
 * DDIA-shaped synthetic fixture for issue #216 / ADR-018.
 *
 * Mirrors the historical production evidence:
 *  - 803 chunks, 12 chapters, ~177 substantive sections
 *  - front matter (Preface, Dedication, Part I divider, Copyright, TOC, About the Author)
 *    with saturated legacy `qualityScore` but low `sectionQualitySignal` (< 0.3)
 *    and low `semanticQualityScore`
 *  - over-represented quote drafts (> 30% of pool) with valid structure, weak learning value
 *  - one non-English (Polish) chapter with strong semantic signal and a section
 *    embedding aligned with the made-up learning-goal vector
 *  - section embeddings engineered so goal-set vs goal-cleared rankings diverge
 *
 * Counts are synthetic but shaped to trigger every scorer without being huge.
 */

const DOCUMENT_ID = "doc-ddia";
const DOCUMENT_TITLE = "Designing Data-Intensive Applications";
const DOCUMENT_CHUNK_COUNT = 803;
const EMBEDDING_DIMENSIONS = 8;

export const DDIA_LEARNING_GOAL =
  "Understand the big picture, Get practical techniques for designing data systems";

/**
 * Synthetic unit vector representing the learning goal. The dimensions are
 * arbitrary — we only care that some sections correlate with it.
 */
export const DDIA_GOAL_EMBEDDING: number[] = normalize([0.9, 0.7, 0.8, 0.6, 0.3, 0.2, 0.1, 0.0]);

type Section = {
  sectionId: string;
  sectionTitle: string;
  chunkStartIndex: number;
  chunkEndIndex: number;
  /** Section-level ranker signal. < 0.3 marks front matter. */
  sectionQualitySignal: number;
  /** 0-1 semantic value for learners on this section. */
  semanticQualityScore: number;
  /** 0-1 legacy structural score. Saturates near 1.0 like DDIA production data. */
  qualityScore: number;
  language: "en" | "pl" | "de";
  /** Correlation with `DDIA_GOAL_EMBEDDING`, in [0, 1]. Drives section embedding. */
  goalCorrelation: number;
  /** Mix of drafts this section contributes to the pool. */
  draftMix: FixturePostType[];
  contentPreview: string;
};

const FRONT_MATTER: Section[] = [
  {
    sectionId: "sec-preface",
    sectionTitle: "Preface",
    chunkStartIndex: 0,
    chunkEndIndex: 2,
    sectionQualitySignal: 0.15,
    semanticQualityScore: 0.18,
    qualityScore: 0.97,
    language: "en",
    goalCorrelation: 0.2,
    draftMix: ["summary", "quote"],
    contentPreview:
      "This book is a journey through the principles of data-intensive applications. Let me tell you why I wrote it.",
  },
  {
    sectionId: "sec-dedication",
    sectionTitle: "Dedication",
    chunkStartIndex: 2,
    chunkEndIndex: 4,
    sectionQualitySignal: 0.05,
    semanticQualityScore: 0.04,
    qualityScore: 0.94,
    language: "en",
    goalCorrelation: 0.0,
    draftMix: ["quote"],
    contentPreview: "To my family. Without your patience this book would not exist.",
  },
  {
    sectionId: "sec-part1-divider",
    sectionTitle: "Part I. Foundations of Data Systems",
    chunkStartIndex: 6,
    chunkEndIndex: 8,
    sectionQualitySignal: 0.22,
    semanticQualityScore: 0.22,
    qualityScore: 0.98,
    language: "en",
    goalCorrelation: 0.25,
    draftMix: ["summary", "insight"],
    contentPreview:
      "Part I lays the foundations. We will cover reliability, scalability and maintainability before touching storage.",
  },
  {
    sectionId: "sec-copyright",
    sectionTitle: "Copyright",
    chunkStartIndex: 8,
    chunkEndIndex: 10,
    sectionQualitySignal: 0.02,
    semanticQualityScore: 0.02,
    qualityScore: 0.92,
    language: "en",
    goalCorrelation: 0.0,
    draftMix: ["quote"],
    contentPreview:
      "All rights reserved. Printed in the United States of America. No part of this publication...",
  },
  {
    sectionId: "sec-toc",
    sectionTitle: "Table of Contents",
    chunkStartIndex: 10,
    chunkEndIndex: 12,
    sectionQualitySignal: 0.08,
    semanticQualityScore: 0.06,
    qualityScore: 0.9,
    language: "en",
    goalCorrelation: 0.1,
    draftMix: ["summary"],
    contentPreview: "Chapter 1 Reliable, Scalable and Maintainable Applications ... 1",
  },
  {
    sectionId: "sec-about-author",
    sectionTitle: "About the Author",
    chunkStartIndex: 12,
    chunkEndIndex: 14,
    sectionQualitySignal: 0.18,
    semanticQualityScore: 0.08,
    qualityScore: 0.95,
    language: "en",
    goalCorrelation: 0.15,
    draftMix: ["quote", "summary"],
    contentPreview:
      "The author is a researcher and engineer who has worked on large-scale data infrastructure.",
  },
];

const CHAPTER_TITLES = [
  "Reliable, Scalable, and Maintainable Applications",
  "Data Models and Query Languages",
  "Storage and Retrieval",
  "Encoding and Evolution",
  "Replication",
  "Partitioning",
  "Transactions",
  "The Trouble with Distributed Systems",
  "Consistency and Consensus",
  "Batch Processing",
  "Stream Processing",
  "The Future of Data Systems",
];

type ChapterShape = {
  baseChunk: number;
  sectionCount: number;
  baseSemantic: number;
  baseSignal: number;
  baseQuality: number;
  baseGoalCorrelation: number;
  /** Force a quote-heavy chapter to reproduce the over-represented quote bug. */
  quoteHeavy?: boolean;
};

const CHAPTER_SHAPES: ChapterShape[] = [
  // Some chapters intentionally weak so >=20% of drafts fall below 0.7 semantic.
  {
    baseChunk: 18,
    sectionCount: 12,
    baseSemantic: 0.82,
    baseSignal: 0.85,
    baseQuality: 0.96,
    baseGoalCorrelation: 0.9,
  },
  {
    baseChunk: 72,
    sectionCount: 14,
    baseSemantic: 0.55,
    baseSignal: 0.68,
    baseQuality: 0.88,
    baseGoalCorrelation: 0.4,
  },
  {
    baseChunk: 140,
    sectionCount: 16,
    baseSemantic: 0.9,
    baseSignal: 0.9,
    baseQuality: 0.98,
    baseGoalCorrelation: 0.85,
    quoteHeavy: true,
  },
  {
    baseChunk: 212,
    sectionCount: 12,
    baseSemantic: 0.58,
    baseSignal: 0.7,
    baseQuality: 0.87,
    baseGoalCorrelation: 0.35,
  },
  {
    baseChunk: 270,
    sectionCount: 16,
    baseSemantic: 0.88,
    baseSignal: 0.92,
    baseQuality: 0.97,
    baseGoalCorrelation: 0.88,
  },
  {
    baseChunk: 340,
    sectionCount: 14,
    baseSemantic: 0.54,
    baseSignal: 0.66,
    baseQuality: 0.86,
    baseGoalCorrelation: 0.32,
  },
  {
    baseChunk: 410,
    sectionCount: 18,
    baseSemantic: 0.92,
    baseSignal: 0.93,
    baseQuality: 0.99,
    baseGoalCorrelation: 0.9,
    quoteHeavy: true,
  },
  {
    baseChunk: 490,
    sectionCount: 14,
    baseSemantic: 0.6,
    baseSignal: 0.72,
    baseQuality: 0.9,
    baseGoalCorrelation: 0.42,
  },
  {
    baseChunk: 560,
    sectionCount: 16,
    baseSemantic: 0.88,
    baseSignal: 0.9,
    baseQuality: 0.97,
    baseGoalCorrelation: 0.86,
    quoteHeavy: true,
  },
  {
    baseChunk: 630,
    sectionCount: 14,
    baseSemantic: 0.5,
    baseSignal: 0.62,
    baseQuality: 0.85,
    baseGoalCorrelation: 0.3,
  },
  {
    baseChunk: 700,
    sectionCount: 14,
    baseSemantic: 0.78,
    baseSignal: 0.82,
    baseQuality: 0.94,
    baseGoalCorrelation: 0.75,
  },
  {
    baseChunk: 770,
    sectionCount: 10,
    baseSemantic: 0.48,
    baseSignal: 0.58,
    baseQuality: 0.84,
    baseGoalCorrelation: 0.28,
  },
];

function buildChapterSections(): Section[] {
  const sections: Section[] = [];
  let sectionCursor = 0;
  CHAPTER_SHAPES.forEach((shape, chapterIndex) => {
    const chapterTitle = CHAPTER_TITLES[chapterIndex]!;
    const chunksPerSection = Math.max(
      1,
      Math.floor(
        (CHAPTER_SHAPES[chapterIndex + 1]?.baseChunk ?? DOCUMENT_CHUNK_COUNT) - shape.baseChunk,
      ) / shape.sectionCount,
    );
    for (let i = 0; i < shape.sectionCount; i++) {
      const chunkStartIndex = shape.baseChunk + Math.floor(i * chunksPerSection);
      const chunkEndIndex = chunkStartIndex + Math.max(1, Math.floor(chunksPerSection) - 1);
      const semanticJitter = ((sectionCursor % 5) - 2) * 0.07;
      const signalJitter = ((sectionCursor % 4) - 1.5) * 0.06;
      const correlationJitter = ((sectionCursor % 3) - 1) * 0.05;
      const isQuoteHeavy = shape.quoteHeavy === true && i % 2 === 0;
      const mix: FixturePostType[] = isQuoteHeavy
        ? ["quote", "quote", "quote", "insight"]
        : i % 3 === 0
          ? ["insight", "summary", "quiz"]
          : ["insight", "quote", "summary"];
      sections.push({
        sectionId: `sec-ch${chapterIndex + 1}-${i + 1}`,
        sectionTitle: `${chapterTitle} - ${i + 1}`,
        chunkStartIndex,
        chunkEndIndex,
        sectionQualitySignal: clamp(shape.baseSignal + signalJitter, 0.35, 0.98),
        semanticQualityScore: clamp(shape.baseSemantic + semanticJitter, 0.25, 0.98),
        qualityScore: clamp(shape.baseQuality + ((sectionCursor % 3) - 1) * 0.02, 0.82, 1.0),
        language: "en",
        goalCorrelation: clamp(shape.baseGoalCorrelation + correlationJitter, 0.1, 0.98),
        draftMix: mix,
        contentPreview: `Discussion of ${chapterTitle.toLowerCase()} with concrete tradeoffs, failure modes and decision rules (section ${i + 1}).`,
      });
      sectionCursor++;
    }
  });
  return sections;
}

const POLISH_SECTION: Section = {
  sectionId: "sec-ch5-pl-translator-note",
  sectionTitle: "Replikacja - notatka tlumacza",
  chunkStartIndex: 305,
  chunkEndIndex: 308,
  sectionQualitySignal: 0.9,
  semanticQualityScore: 0.87,
  qualityScore: 0.96,
  language: "pl",
  // Strong correlation with the goal vector - proves goal relevance is language-agnostic.
  goalCorrelation: 0.92,
  draftMix: ["insight", "summary"],
  contentPreview:
    "Replikacja synchroniczna gwarantuje spojnosc kosztem dostepnosci; asynchroniczna odwraca ten kompromis. Wybor zalezy od wymagan aplikacji.",
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function sectionToDrafts(section: Section): FixtureDraft[] {
  return section.draftMix.map((postType, i) => ({
    draftId: `${section.sectionId}-${postType}-${i}`,
    documentId: DOCUMENT_ID,
    sectionId: section.sectionId,
    sectionTitle: section.sectionTitle,
    chunkStartIndex: section.chunkStartIndex,
    chunkEndIndex: section.chunkEndIndex,
    sectionQualitySignal: section.sectionQualitySignal,
    qualityScore: section.qualityScore,
    // Quotes inherit section semantic but collapse toward 0.5 when from weak sections -
    // this reproduces "valid quote shape, weak learning value".
    semanticQualityScore:
      postType === "quote"
        ? clamp(section.semanticQualityScore * 0.75 + 0.1, 0.1, 0.95)
        : section.semanticQualityScore,
    postType,
    strategy: "initial",
    language: section.language,
    contentPreview: section.contentPreview,
  }));
}

/**
 * Construct a section embedding whose cosine similarity with
 * `DDIA_GOAL_EMBEDDING` is approximately `section.goalCorrelation`.
 */
function sectionEmbeddingFor(section: Section): number[] {
  const aligned = DDIA_GOAL_EMBEDDING.map((c) => c * section.goalCorrelation);
  // Orthogonal noise component so non-correlated sections are not zero vectors.
  const orthogonal = orthogonalVector(section.sectionId).map(
    (c) => c * (1 - section.goalCorrelation),
  );
  return normalize(aligned.map((value, idx) => value + orthogonal[idx]!));
}

function orthogonalVector(seed: string): number[] {
  // Deterministic pseudo-orthogonal vector derived from the section id hash.
  const h = hash(seed);
  return Array.from({ length: EMBEDDING_DIMENSIONS }, (_, i) => {
    const sign = (h >> i) & 1 ? -1 : 1;
    return sign * ((h >> (i * 3)) % 97) * 0.01;
  });
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h = (h ^ s.charCodeAt(i)) * 16777619;
  }
  return h >>> 0;
}

function normalize(v: number[]): number[] {
  const magnitude = Math.sqrt(v.reduce((a, b) => a + b * b, 0));
  return magnitude === 0 ? v.slice() : v.map((x) => x / magnitude);
}

export function buildDdiaFixture(options: { goalActive: boolean }): FeedServingFixture {
  const allSections: Section[] = [...FRONT_MATTER, ...buildChapterSections(), POLISH_SECTION];
  const drafts = allSections.flatMap(sectionToDrafts);
  const sectionEmbeddings = new Map<string, number[]>(
    allSections.map((s) => [s.sectionId, sectionEmbeddingFor(s)]),
  );

  return {
    id: options.goalActive ? "ddia-goal-set" : "ddia-goal-cleared",
    description: options.goalActive
      ? "DDIA-shaped pool with learning goal active"
      : "DDIA-shaped pool with learning goal cleared",
    documentId: DOCUMENT_ID,
    documentTitle: DOCUMENT_TITLE,
    documentChunkCount: DOCUMENT_CHUNK_COUNT,
    primaryLanguage: "en",
    learningGoal: options.goalActive ? DDIA_LEARNING_GOAL : "",
    goalEmbedding: options.goalActive ? DDIA_GOAL_EMBEDDING : undefined,
    sectionEmbeddings,
    drafts,
  };
}

export const DDIA_FIXTURE_GOAL_SET = buildDdiaFixture({ goalActive: true });
export const DDIA_FIXTURE_GOAL_CLEARED = buildDdiaFixture({ goalActive: false });
