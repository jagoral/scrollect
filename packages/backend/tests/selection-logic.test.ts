import { describe, expect, test } from "bun:test";

import {
  buildSummaryContext,
  filterChunksBySemantic,
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
});
