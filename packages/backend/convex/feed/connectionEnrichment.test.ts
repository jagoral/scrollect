import { describe, expect, test } from "bun:test";

import {
  mergeConnectionChunks,
  buildConnectionPairMap,
  enrichConnectionCard,
} from "./connectionEnrichment";
import type { ConnectionPair } from "./discovery";
import type { ChunkInfo } from "./sampling";
import type { RawCard } from "./validation";

function makeChunk(id: string, documentId: string, title?: string): ChunkInfo {
  return {
    _id: id,
    content: `Content for ${id}`,
    documentId,
    documentTitle: title ?? `Doc ${documentId}`,
  };
}

function makePair(overrides: {
  chunkA: ChunkInfo;
  chunkB: ChunkInfo;
  score?: number;
  type?: "cross_document" | "within_document";
}): ConnectionPair {
  return {
    chunkA: overrides.chunkA,
    chunkB: overrides.chunkB,
    similarityScore: overrides.score ?? 0.9,
    connectionType: overrides.type ?? "cross_document",
  };
}

describe("mergeConnectionChunks", () => {
  test("returns selected unchanged when no connection pairs", () => {
    const selected = [makeChunk("c1", "d1"), makeChunk("c2", "d2")];
    const result = mergeConnectionChunks({ selected, connectionPairs: [] });

    expect(result.merged).toEqual(selected);
    expect(result.connectionHints).toEqual([]);
  });

  test("appends connection chunks not already in selected", () => {
    const selected = [makeChunk("c1", "d1")];
    const chunkA = makeChunk("c1", "d1");
    const chunkB = makeChunk("c2", "d2");
    const pair = makePair({ chunkA, chunkB });

    const result = mergeConnectionChunks({ selected, connectionPairs: [pair] });

    expect(result.merged).toHaveLength(2);
    expect(result.merged[1]!._id).toBe("c2");
  });

  test("does not duplicate chunks already in selected", () => {
    const selected = [makeChunk("c1", "d1"), makeChunk("c2", "d2")];
    const pair = makePair({ chunkA: selected[0]!, chunkB: selected[1]! });

    const result = mergeConnectionChunks({ selected, connectionPairs: [pair] });

    expect(result.merged).toHaveLength(2);
  });

  test("generates connection hints with correct indices", () => {
    const selected = [makeChunk("c1", "d1")];
    const chunkB = makeChunk("c2", "d2", "System Design Book");
    const pair = makePair({ chunkA: selected[0]!, chunkB, score: 0.91 });

    const result = mergeConnectionChunks({ selected, connectionPairs: [pair] });

    expect(result.connectionHints).toHaveLength(1);
    expect(result.connectionHints[0]).toContain("Chunks 0");
    expect(result.connectionHints[0]).toContain("and 1");
    expect(result.connectionHints[0]).toContain("0.91");
    expect(result.connectionHints[0]).toContain("cross-document");
  });

  test("generates within-document label for within_document pairs", () => {
    const selected = [makeChunk("c1", "d1"), makeChunk("c2", "d1")];
    const pair = makePair({
      chunkA: selected[0]!,
      chunkB: selected[1]!,
      type: "within_document",
    });

    const result = mergeConnectionChunks({ selected, connectionPairs: [pair] });

    expect(result.connectionHints[0]).toContain("within-document");
  });
});

describe("buildConnectionPairMap", () => {
  test("maps pair indices as sorted colon-separated key", () => {
    const chunks = [makeChunk("c1", "d1"), makeChunk("c2", "d2"), makeChunk("c3", "d3")];
    const pair = makePair({ chunkA: chunks[2]!, chunkB: chunks[0]!, score: 0.88 });

    const map = buildConnectionPairMap([pair], chunks);

    expect(map.size).toBe(1);
    expect(map.has("0:2")).toBe(true);
    expect(map.get("0:2")!.similarityScore).toBe(0.88);
  });

  test("skips pairs with chunks not in the array", () => {
    const chunks = [makeChunk("c1", "d1")];
    const pair = makePair({
      chunkA: makeChunk("c1", "d1"),
      chunkB: makeChunk("c99", "d99"),
      score: 0.95,
    });

    const map = buildConnectionPairMap([pair], chunks);

    expect(map.size).toBe(0);
  });

  test("handles multiple pairs", () => {
    const chunks = [makeChunk("c1", "d1"), makeChunk("c2", "d2"), makeChunk("c3", "d3")];
    const pairs = [
      makePair({ chunkA: chunks[0]!, chunkB: chunks[1]!, score: 0.85 }),
      makePair({ chunkA: chunks[1]!, chunkB: chunks[2]!, score: 0.92 }),
    ];

    const map = buildConnectionPairMap(pairs, chunks);

    expect(map.size).toBe(2);
    expect(map.get("0:1")!.similarityScore).toBe(0.85);
    expect(map.get("1:2")!.similarityScore).toBe(0.92);
  });
});

describe("enrichConnectionCard", () => {
  test("attaches score and type from matching pair in map", () => {
    const card: RawCard = {
      type: "connection",
      content: "Connection text",
      sourceChunkIndices: [0, 2],
      sourceATitleHint: "A",
      sourceBTitleHint: "B",
    };
    const cardChunks = [makeChunk("c1", "d1"), makeChunk("c3", "d2")];
    const connectionPairMap = new Map([
      ["0:2", { similarityScore: 0.93, connectionType: "cross_document" as const }],
    ]);

    enrichConnectionCard({ card, cardChunks, connectionPairMap });

    expect(card.similarityScore).toBe(0.93);
    expect(card.connectionType).toBe("cross_document");
  });

  test("falls back to cross_document when chunks span multiple docs", () => {
    const card: RawCard = {
      type: "connection",
      content: "Connection text",
      sourceChunkIndices: [1, 3],
      sourceATitleHint: "A",
      sourceBTitleHint: "B",
    };
    const cardChunks = [makeChunk("c2", "d1"), makeChunk("c4", "d2")];
    const connectionPairMap = new Map<
      string,
      { similarityScore: number; connectionType: "cross_document" | "within_document" }
    >();

    enrichConnectionCard({ card, cardChunks, connectionPairMap });

    expect(card.similarityScore).toBe(0);
    expect(card.connectionType).toBe("cross_document");
  });

  test("falls back to within_document when chunks share same doc", () => {
    const card: RawCard = {
      type: "connection",
      content: "Connection text",
      sourceChunkIndices: [0, 1],
      sourceATitleHint: "A",
      sourceBTitleHint: "B",
    };
    const cardChunks = [makeChunk("c1", "d1"), makeChunk("c2", "d1")];
    const connectionPairMap = new Map<
      string,
      { similarityScore: number; connectionType: "cross_document" | "within_document" }
    >();

    enrichConnectionCard({ card, cardChunks, connectionPairMap });

    expect(card.similarityScore).toBe(0);
    expect(card.connectionType).toBe("within_document");
  });
});
