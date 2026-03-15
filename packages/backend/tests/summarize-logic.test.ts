import { describe, expect, test } from "bun:test";

import {
  buildSummaryVectorPoints,
  groupChunksBySection,
  truncateSectionText,
} from "../convex/pipeline/summarizeLogic";

describe("groupChunksBySection", () => {
  test("groups chunks with the same sectionTitle together", () => {
    const chunks = [
      { content: "a", chunkIndex: 0, sectionTitle: "Intro" },
      { content: "b", chunkIndex: 1, sectionTitle: "Intro" },
      { content: "c", chunkIndex: 2, sectionTitle: "Methods" },
    ];

    const groups = groupChunksBySection(chunks);

    expect(groups).toHaveLength(2);
    expect(groups[0]!.sectionTitle).toBe("Intro");
    expect(groups[0]!.chunks).toHaveLength(2);
    expect(groups[1]!.sectionTitle).toBe("Methods");
    expect(groups[1]!.chunks).toHaveLength(1);
  });

  test("chunks without sectionTitle go to (ungrouped)", () => {
    const chunks = [
      { content: "a", chunkIndex: 0 },
      { content: "b", chunkIndex: 1, sectionTitle: "Intro" },
      { content: "c", chunkIndex: 2 },
    ];

    const groups = groupChunksBySection(chunks);

    expect(groups).toHaveLength(2);
    const ungrouped = groups.find((g) => g.sectionTitle === "(ungrouped)")!;
    expect(ungrouped.chunks).toHaveLength(2);
    expect(ungrouped.chunks[0]!.chunkIndex).toBe(0);
    expect(ungrouped.chunks[1]!.chunkIndex).toBe(2);
  });

  test("returns empty array for empty input", () => {
    expect(groupChunksBySection([])).toEqual([]);
  });
});

describe("truncateSectionText", () => {
  test("concatenates all chunks when within limit", () => {
    const chunks = [{ content: "hello" }, { content: "world" }];
    const result = truncateSectionText(chunks, 100);
    expect(result).toBe("hello\n\nworld");
  });

  test("stops adding chunks when limit would be exceeded", () => {
    const chunks = [
      { content: "a".repeat(50) },
      { content: "b".repeat(50) },
      { content: "c".repeat(50) },
    ];
    const result = truncateSectionText(chunks, 80);
    expect(result).toBe("a".repeat(50));
    expect(result).not.toContain("b");
  });

  test("returns empty string for empty input", () => {
    expect(truncateSectionText([], 100)).toBe("");
  });
});

describe("buildSummaryVectorPoints", () => {
  const fakeIdToUuid = (id: string) => `uuid-${id}`;

  test("builds document + section vector points from embeddings", () => {
    const result = buildSummaryVectorPoints({
      documentId: "doc1",
      userId: "user1",
      docSummary: "doc summary",
      sectionResults: [
        { sectionTitle: "Intro", summary: "intro summary", chunkStartIndex: 0, chunkEndIndex: 2 },
      ],
      vectors: [
        [0.1, 0.2],
        [0.3, 0.4],
      ],
      idToUuid: fakeIdToUuid,
    });

    expect(result.docPoint.payload.summaryType).toBe("document");
    expect(result.docPoint.vector).toEqual([0.1, 0.2]);
    expect(result.docPoint.payload.documentId).toBe("doc1");

    expect(result.sectionPoints).toHaveLength(1);
    expect(result.sectionPoints[0]!.payload.summaryType).toBe("section");
    expect(result.sectionPoints[0]!.payload.sectionTitle).toBe("Intro");
    expect(result.sectionPoints[0]!.vector).toEqual([0.3, 0.4]);
  });

  test("sectionDbRecords match section results with embeddingIds", () => {
    const result = buildSummaryVectorPoints({
      documentId: "doc1",
      userId: "user1",
      docSummary: "doc summary",
      sectionResults: [
        { sectionTitle: "A", summary: "a", chunkStartIndex: 0, chunkEndIndex: 1 },
        { sectionTitle: "B", summary: "b", chunkStartIndex: 2, chunkEndIndex: 5 },
      ],
      vectors: [[1], [2], [3]],
      idToUuid: fakeIdToUuid,
    });

    expect(result.sectionDbRecords).toHaveLength(2);
    expect(result.sectionDbRecords[0]!.sectionTitle).toBe("A");
    expect(result.sectionDbRecords[0]!.chunkStartIndex).toBe(0);
    expect(result.sectionDbRecords[1]!.sectionTitle).toBe("B");
    expect(result.sectionDbRecords[1]!.chunkEndIndex).toBe(5);
    expect(result.sectionDbRecords[0]!.embeddingId).toBeTruthy();
  });
});
