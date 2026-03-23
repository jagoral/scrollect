import { describe, expect, test } from "bun:test";

import { FRESHNESS_DECAY_WINDOW_MS } from "../convex/feed/constants";
import {
  buildSummaryContext,
  filterChunksBySemantic,
  type LearningGoalEntry,
  rankByUsage,
} from "../convex/feed/selectionLogic";

const chunk = (id: string, docId: string, section?: string) => ({
  _id: id,
  content: `content-${id}`,
  documentId: docId,
  documentTitle: `Doc ${docId}`,
  sectionTitle: section,
});

describe("filterChunksBySemantic", () => {
  test("returns only chunks from selected documents", () => {
    const chunks = [chunk("c1", "d1"), chunk("c2", "d2"), chunk("c3", "d1")];

    const result = filterChunksBySemantic({
      allChunks: chunks,
      selectedDocIds: new Set(["d1"]),
      selectedSections: new Set(),
    });

    expect(result.map((c) => c._id)).toEqual(["c1", "c3"]);
  });

  test("further filters by section when sections are provided", () => {
    const chunks = [
      chunk("c1", "d1", "Intro"),
      chunk("c2", "d1", "Methods"),
      chunk("c3", "d1", "Intro"),
    ];

    const result = filterChunksBySemantic({
      allChunks: chunks,
      selectedDocIds: new Set(["d1"]),
      selectedSections: new Set(["d1:Intro"]),
    });

    expect(result.map((c) => c._id)).toEqual(["c1", "c3"]);
  });

  test("chunks without sectionTitle match (ungrouped) key", () => {
    const chunks = [chunk("c1", "d1"), chunk("c2", "d1", "Intro")];

    const result = filterChunksBySemantic({
      allChunks: chunks,
      selectedDocIds: new Set(["d1"]),
      selectedSections: new Set(["d1:(ungrouped)"]),
    });

    expect(result.map((c) => c._id)).toEqual(["c1"]);
  });

  test("returns all doc chunks when no sections provided", () => {
    const chunks = [chunk("c1", "d1", "Intro"), chunk("c2", "d1", "Methods"), chunk("c3", "d2")];

    const result = filterChunksBySemantic({
      allChunks: chunks,
      selectedDocIds: new Set(["d1"]),
      selectedSections: new Set(),
    });

    expect(result).toHaveLength(2);
    expect(result.every((c) => c.documentId === "d1")).toBe(true);
  });

  test("empty allChunks returns empty", () => {
    const result = filterChunksBySemantic({
      allChunks: [],
      selectedDocIds: new Set(["d1"]),
      selectedSections: new Set(),
    });

    expect(result).toEqual([]);
  });

  test("empty selectedDocIds returns empty", () => {
    const chunks = [chunk("c1", "d1"), chunk("c2", "d2")];

    const result = filterChunksBySemantic({
      allChunks: chunks,
      selectedDocIds: new Set(),
      selectedSections: new Set(),
    });

    expect(result).toEqual([]);
  });
});

describe("rankByUsage", () => {
  test("unused chunks appear before used chunks", () => {
    const chunks = [chunk("c1", "d1"), chunk("c2", "d1"), chunk("c3", "d2")];
    const usageMap = new Map([["c1", { types: new Set(["insight"]), totalCount: 5 }]]);

    const result = rankByUsage({ chunks, usageMap, count: 3 });

    const c1Index = result.findIndex((c) => c._id === "c1");
    const c2Index = result.findIndex((c) => c._id === "c2");
    expect(c1Index).toBeGreaterThan(c2Index);
  });

  test("respects count limit", () => {
    const chunks = [chunk("c1", "d1"), chunk("c2", "d1"), chunk("c3", "d2")];

    const result = rankByUsage({ chunks, usageMap: new Map(), count: 2 });

    expect(result).toHaveLength(2);
  });

  test("enforces cross-document diversity when all chunks from one doc", () => {
    const candidates = [chunk("c1", "d1"), chunk("c2", "d1")];
    const allChunks = [...candidates, chunk("c3", "d2")];

    const result = rankByUsage({
      chunks: candidates,
      usageMap: new Map(),
      count: 2,
      allChunksForDiversity: allChunks,
    });

    const docIds = new Set(result.map((c) => c.documentId));
    expect(docIds.size).toBe(2);
  });

  test("deduplicates by chunk id", () => {
    const chunks = [chunk("c1", "d1"), chunk("c1", "d1"), chunk("c2", "d2")];

    const result = rankByUsage({ chunks, usageMap: new Map(), count: 3 });

    const ids = result.map((c) => c._id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("with empty usageMap preserves insertion order", () => {
    const chunks = [chunk("c1", "d1"), chunk("c2", "d2"), chunk("c3", "d3")];

    const result = rankByUsage({ chunks, usageMap: new Map(), count: 3 });

    expect(result.map((c) => c._id)).toEqual(["c1", "c2", "c3"]);
  });

  test("boosts chunks from fresh documents when docCreatedAtMap provided", () => {
    const now = Date.now();
    const freshDocTime = now - 1000;
    const oldDocTime = now - FRESHNESS_DECAY_WINDOW_MS - 1000;

    const chunks = [chunk("c1", "d_old"), chunk("c2", "d_fresh")];
    const usageMap = new Map([
      ["c1", { types: new Set<string>(), totalCount: 0 }],
      ["c2", { types: new Set<string>(), totalCount: 0 }],
    ]);
    const docCreatedAtMap = new Map([
      ["d_old", oldDocTime],
      ["d_fresh", freshDocTime],
    ]);

    const result = rankByUsage({ chunks, usageMap, docCreatedAtMap, now, count: 2 });

    expect(result[0]!._id).toBe("c2");
  });

  test("unused old chunk outranks heavily-used fresh chunk (freshness boosts, not overrides)", () => {
    const now = Date.now();
    const freshDocTime = now - 1000;
    const oldDocTime = now - FRESHNESS_DECAY_WINDOW_MS - 1000;

    const chunks = [chunk("c_fresh_used", "d_fresh"), chunk("c_old_unused", "d_old")];
    const usageMap = new Map([
      ["c_fresh_used", { types: new Set(["insight", "quiz", "quote"]), totalCount: 5 }],
    ]);
    const docCreatedAtMap = new Map([
      ["d_fresh", freshDocTime],
      ["d_old", oldDocTime],
    ]);

    const result = rankByUsage({ chunks, usageMap, docCreatedAtMap, now, count: 2 });

    // Fresh chunk weight: (1/(1+5)) * 2.0 = 0.333
    // Old unused weight:  (1/(1+0)) * 1.0 = 1.0
    // Old unused should rank first - freshness is a boost, not an override
    expect(result[0]!._id).toBe("c_old_unused");
  });

  test("without docCreatedAtMap falls back to usage-only ranking", () => {
    const chunks = [chunk("c1", "d1"), chunk("c2", "d2")];
    const usageMap = new Map([["c2", { types: new Set(["insight"]), totalCount: 3 }]]);

    const result = rankByUsage({ chunks, usageMap, count: 2 });

    expect(result[0]!._id).toBe("c1");
  });

  test("highlighted chunks rank higher than non-highlighted with equal usage", () => {
    const chunks = [chunk("c1", "d1"), chunk("c2", "d2")];

    const result = rankByUsage({
      chunks,
      usageMap: new Map(),
      highlightedChunkIds: new Set(["c2"]),
      count: 2,
    });

    // c2 gets HIGHLIGHT_BOOST (3.0x), c1 gets 1.0 - c2 should rank first
    expect(result[0]!._id).toBe("c2");
  });

  test("highlight boost stacks with recency boost", () => {
    const now = Date.now();
    const freshDocTime = now - 1000;
    const oldDocTime = now - FRESHNESS_DECAY_WINDOW_MS - 1000;

    // c1: old doc, highlighted (1.0 recency * 3.0 highlight = 3.0)
    // c2: fresh doc, not highlighted (2.0 recency * 1.0 highlight = 2.0)
    const chunks = [chunk("c1", "d_old"), chunk("c2", "d_fresh")];

    const result = rankByUsage({
      chunks,
      usageMap: new Map(),
      docCreatedAtMap: new Map([
        ["d_old", oldDocTime],
        ["d_fresh", freshDocTime],
      ]),
      highlightedChunkIds: new Set(["c1"]),
      now,
      count: 2,
    });

    // Highlight boost (3.0) outweighs freshness boost (2.0)
    expect(result[0]!._id).toBe("c1");
  });

  test("without highlightedChunkIds, ranking is unchanged", () => {
    const chunks = [chunk("c1", "d1"), chunk("c2", "d2")];
    const usageMap = new Map([["c1", { types: new Set(["insight"]), totalCount: 2 }]]);

    const resultWithout = rankByUsage({ chunks, usageMap, count: 2 });
    const resultWithUndefined = rankByUsage({
      chunks,
      usageMap,
      highlightedChunkIds: undefined,
      count: 2,
    });

    expect(resultWithout.map((c) => c._id)).toEqual(resultWithUndefined.map((c) => c._id));
  });

  test("empty highlightedChunkIds set has no effect", () => {
    const chunks = [chunk("c1", "d1"), chunk("c2", "d2")];
    const usageMap = new Map([["c1", { types: new Set(["insight"]), totalCount: 2 }]]);

    const resultWithout = rankByUsage({ chunks, usageMap, count: 2 });
    const resultWithEmpty = rankByUsage({
      chunks,
      usageMap,
      highlightedChunkIds: new Set(),
      count: 2,
    });

    expect(resultWithout.map((c) => c._id)).toEqual(resultWithEmpty.map((c) => c._id));
  });

  test("heavily used highlighted chunk can still be outranked by unused non-highlighted", () => {
    const chunks = [chunk("c1", "d1"), chunk("c2", "d2")];
    const usageMap = new Map([
      ["c1", { types: new Set(["insight", "quiz", "quote", "summary"]), totalCount: 20 }],
    ]);

    const result = rankByUsage({
      chunks,
      usageMap,
      highlightedChunkIds: new Set(["c1"]),
      count: 2,
    });

    // c1 weight: (1/(1+20)) * 3.0 = 0.143
    // c2 weight: (1/(1+0)) * 1.0 = 1.0
    // c2 should rank first despite c1 being highlighted
    expect(result[0]!._id).toBe("c2");
  });
});

describe("buildSummaryContext", () => {
  test("returns empty string when no doc summaries match selected chunks", () => {
    const result = buildSummaryContext({
      docSummaries: [{ documentId: "d1", documentTitle: "Doc 1", summary: "summary" }],
      sectionSummaries: [],
      selectedDocIds: new Set(["d99"]),
    });

    expect(result).toBe("");
  });

  test("includes document and section context for matching documents", () => {
    const result = buildSummaryContext({
      docSummaries: [{ documentId: "d1", documentTitle: "AI Basics", summary: "About AI" }],
      sectionSummaries: [{ documentId: "d1", sectionTitle: "Intro", summary: "Intro to AI" }],
      selectedDocIds: new Set(["d1"]),
    });

    expect(result).toContain("AI Basics");
    expect(result).toContain("About AI");
    expect(result).toContain("Intro");
    expect(result).toContain("Intro to AI");
  });

  test("filters to only relevant documents", () => {
    const result = buildSummaryContext({
      docSummaries: [
        { documentId: "d1", documentTitle: "Doc 1", summary: "s1" },
        { documentId: "d2", documentTitle: "Doc 2", summary: "s2" },
      ],
      sectionSummaries: [],
      selectedDocIds: new Set(["d1"]),
    });

    expect(result).toContain("Doc 1");
    expect(result).not.toContain("Doc 2");
  });

  test("omits section context header when no sections match", () => {
    const result = buildSummaryContext({
      docSummaries: [{ documentId: "d1", documentTitle: "Doc 1", summary: "s1" }],
      sectionSummaries: [{ documentId: "d99", sectionTitle: "Other", summary: "x" }],
      selectedDocIds: new Set(["d1"]),
    });

    expect(result).toContain("Document context");
    expect(result).not.toContain("Section context");
  });

  test("multiple matching documents with sections", () => {
    const result = buildSummaryContext({
      docSummaries: [
        { documentId: "d1", documentTitle: "Doc 1", summary: "s1" },
        { documentId: "d2", documentTitle: "Doc 2", summary: "s2" },
      ],
      sectionSummaries: [
        { documentId: "d1", sectionTitle: "Intro", summary: "intro1" },
        { documentId: "d2", sectionTitle: "Methods", summary: "methods2" },
      ],
      selectedDocIds: new Set(["d1", "d2"]),
    });

    expect(result).toContain("Doc 1");
    expect(result).toContain("s1");
    expect(result).toContain("Doc 2");
    expect(result).toContain("s2");
    expect(result).toContain("Intro");
    expect(result).toContain("intro1");
    expect(result).toContain("Methods");
    expect(result).toContain("methods2");
  });

  test("includes learning goals for selected documents", () => {
    const learningGoals = new Map<string, LearningGoalEntry>([
      ["d1", { title: "AI Basics", goal: "Understand neural networks" }],
      ["d2", { title: "ML Guide", goal: "Learn about transformers" }],
    ]);

    const result = buildSummaryContext({
      docSummaries: [{ documentId: "d1", documentTitle: "AI Basics", summary: "About AI" }],
      sectionSummaries: [],
      selectedDocIds: new Set(["d1"]),
      learningGoals,
    });

    expect(result).toContain("Learning goals:");
    expect(result).toContain(
      'The user wants to learn from "AI Basics": Understand neural networks',
    );
    expect(result).not.toContain("transformers");
  });

  test("omits learning goals section when no goals match selected docs", () => {
    const learningGoals = new Map<string, LearningGoalEntry>([
      ["d99", { title: "Other Doc", goal: "Something else" }],
    ]);

    const result = buildSummaryContext({
      docSummaries: [{ documentId: "d1", documentTitle: "Doc 1", summary: "s1" }],
      sectionSummaries: [],
      selectedDocIds: new Set(["d1"]),
      learningGoals,
    });

    expect(result).not.toContain("Learning goals:");
    expect(result).toContain("Doc 1");
  });

  test("empty learningGoals map produces identical output to omitted", () => {
    const args = {
      docSummaries: [{ documentId: "d1", documentTitle: "Doc 1", summary: "s1" }],
      sectionSummaries: [],
      selectedDocIds: new Set(["d1"]),
    };

    const withoutGoals = buildSummaryContext(args);
    const withEmptyGoals = buildSummaryContext({ ...args, learningGoals: new Map() });

    expect(withEmptyGoals).toBe(withoutGoals);
  });

  test("returns learning goals context even when no doc summaries match", () => {
    const learningGoals = new Map<string, LearningGoalEntry>([
      ["d1", { title: "AI Basics", goal: "Understand neural networks" }],
    ]);

    const result = buildSummaryContext({
      docSummaries: [],
      sectionSummaries: [],
      selectedDocIds: new Set(["d1"]),
      learningGoals,
    });

    expect(result).toContain("Learning goals:");
    expect(result).toContain("Understand neural networks");
    expect(result).not.toContain("Document context:");
  });
});
