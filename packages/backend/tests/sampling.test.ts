import { describe, expect, test } from "bun:test";

import {
  FRESHNESS_WINDOW_MS,
  FRESHNESS_DECAY_WINDOW_MS,
  FRESHNESS_BOOST_FACTOR,
  HIGHLIGHT_BOOST,
  computeRecencyBoost,
} from "../convex/feed/constants";
import {
  buildChunkUsageMap,
  buildTypeCoverageHint,
  frontLoadFreshChunks,
  weightedSample,
} from "../convex/feed/sampling";
import type { ChunkInfo, PostSourceRecord } from "../convex/feed/sampling";

const chunk = (id: string, docId: string, section?: string): ChunkInfo => ({
  _id: id,
  content: `content-${id}`,
  documentId: docId,
  documentTitle: `Doc ${docId}`,
  sectionTitle: section,
});

describe("computeRecencyBoost", () => {
  test("returns FRESHNESS_BOOST_FACTOR for documents within freshness window", () => {
    const now = Date.now();
    const docCreatedAt = now - FRESHNESS_WINDOW_MS + 1000;
    expect(computeRecencyBoost(docCreatedAt, now)).toBe(FRESHNESS_BOOST_FACTOR);
  });

  test("returns 1.0 for documents older than decay window", () => {
    const now = Date.now();
    const docCreatedAt = now - FRESHNESS_DECAY_WINDOW_MS - 1000;
    expect(computeRecencyBoost(docCreatedAt, now)).toBe(1.0);
  });

  test("returns interpolated value between freshness and decay windows", () => {
    const now = Date.now();
    const midAge = (FRESHNESS_WINDOW_MS + FRESHNESS_DECAY_WINDOW_MS) / 2;
    const docCreatedAt = now - midAge;
    const result = computeRecencyBoost(docCreatedAt, now);
    expect(result).toBeGreaterThan(1.0);
    expect(result).toBeLessThan(FRESHNESS_BOOST_FACTOR);
  });
});

describe("buildChunkUsageMap", () => {
  test("builds map from post sources and posts", () => {
    const postSources: PostSourceRecord[] = [
      { chunkId: "c1", postId: "p1", createdAt: 1 },
      { chunkId: "c1", postId: "p2", createdAt: 2 },
      { chunkId: "c2", postId: "p1", createdAt: 3 },
    ];
    const posts = [
      { _id: "p1", postType: "insight" },
      { _id: "p2", postType: "quiz" },
    ];

    const map = buildChunkUsageMap(postSources, posts);

    expect(map.size).toBe(2);
    expect(map.get("c1")!.totalCount).toBe(2);
    expect(map.get("c2")!.totalCount).toBe(1);
  });

  test("tracks types used per chunk", () => {
    const postSources: PostSourceRecord[] = [
      { chunkId: "c1", postId: "p1", createdAt: 1 },
      { chunkId: "c1", postId: "p2", createdAt: 2 },
    ];
    const posts = [
      { _id: "p1", postType: "insight" },
      { _id: "p2", postType: "quiz" },
    ];

    const map = buildChunkUsageMap(postSources, posts);

    const usage = map.get("c1")!;
    expect(usage.types.has("insight")).toBe(true);
    expect(usage.types.has("quiz")).toBe(true);
    expect(usage.types.size).toBe(2);
  });

  test("ignores sources with no matching post", () => {
    const postSources: PostSourceRecord[] = [
      { chunkId: "c1", postId: "p_missing", createdAt: 1 },
      { chunkId: "c2", postId: "p1", createdAt: 2 },
    ];
    const posts = [{ _id: "p1", postType: "insight" }];

    const map = buildChunkUsageMap(postSources, posts);

    expect(map.has("c1")).toBe(false);
    expect(map.has("c2")).toBe(true);
  });
});

describe("buildTypeCoverageHint", () => {
  test("returns empty string when all types are well-covered", () => {
    const chunkUsageMap = new Map<string, { types: Set<string>; totalCount: number }>();
    chunkUsageMap.set("c1", {
      types: new Set(["insight", "quiz", "quote", "summary", "connection"]),
      totalCount: 5,
    });
    chunkUsageMap.set("c2", {
      types: new Set(["insight", "quiz", "quote", "summary", "connection"]),
      totalCount: 5,
    });

    expect(buildTypeCoverageHint(chunkUsageMap)).toBe("");
  });

  test("returns hint listing underused types", () => {
    const chunkUsageMap = new Map<string, { types: Set<string>; totalCount: number }>();
    chunkUsageMap.set("c1", { types: new Set(["insight"]), totalCount: 1 });
    chunkUsageMap.set("c2", { types: new Set(["insight"]), totalCount: 1 });

    const hint = buildTypeCoverageHint(chunkUsageMap);

    expect(hint).toContain("quiz");
    expect(hint).toContain("quote");
    expect(hint).toContain("summary");
    expect(hint).toContain("connection");
  });
});

describe("weightedSample", () => {
  let callIndex = 0;
  const deterministicRandom = () => {
    const values = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
    return values[callIndex++ % values.length]!;
  };

  test("respects count limit", () => {
    callIndex = 0;
    const chunks = [chunk("c1", "d1"), chunk("c2", "d1"), chunk("c3", "d2"), chunk("c4", "d2")];
    const now = Date.now();

    const result = weightedSample({
      chunks,
      chunkUsageMap: new Map(),
      docCreatedAtMap: new Map([
        ["d1", now],
        ["d2", now],
      ]),
      count: 2,
      now,
      randomFn: deterministicRandom,
    });

    expect(result).toHaveLength(2);
  });

  test("highlighted chunks are selected more frequently", () => {
    const now = Date.now();
    const chunks = [chunk("c1", "d1"), chunk("c2", "d2")];

    // c1 weight = 1.0 * 2.5 (type diversity) = 2.5
    // c2 weight = 3.0 * 2.5 (type diversity) = 7.5
    // totalWeight = 10.0
    // randomFn returning 0.3 => rand = 0.3 * 10 = 3.0
    // Walk: c1 (2.5) => rand = 0.5; c2 (7.5) => rand = -7.0 => picks c2
    const result = weightedSample({
      chunks,
      chunkUsageMap: new Map(),
      docCreatedAtMap: new Map([
        ["d1", now],
        ["d2", now],
      ]),
      highlightedChunkIds: new Set(["c2"]),
      count: 1,
      now,
      randomFn: () => 0.3,
    });

    // randomFn=0.3 lands in c2's range (c2 has 75% of total weight)
    expect(result[0]!._id).toBe("c2");
  });

  test("without highlightedChunkIds, behavior is unchanged", () => {
    callIndex = 0;
    const now = Date.now();
    const chunks = [chunk("c1", "d1"), chunk("c2", "d2")];

    const resultWithout = weightedSample({
      chunks,
      chunkUsageMap: new Map(),
      docCreatedAtMap: new Map([
        ["d1", now],
        ["d2", now],
      ]),
      count: 2,
      now,
      randomFn: deterministicRandom,
    });

    callIndex = 0;
    const resultWithEmpty = weightedSample({
      chunks,
      chunkUsageMap: new Map(),
      docCreatedAtMap: new Map([
        ["d1", now],
        ["d2", now],
      ]),
      highlightedChunkIds: new Set(),
      count: 2,
      now,
      randomFn: deterministicRandom,
    });

    expect(resultWithout.map((c) => c._id)).toEqual(resultWithEmpty.map((c) => c._id));
  });

  test("HIGHLIGHT_BOOST constant equals 3.0", () => {
    expect(HIGHLIGHT_BOOST).toBe(3.0);
  });

  test("cross-document diversity enforcement", () => {
    callIndex = 0;
    const chunks = [chunk("c1", "d1"), chunk("c2", "d1"), chunk("c3", "d2")];
    const now = Date.now();

    const alwaysPickFirst = () => 0;

    const result = weightedSample({
      chunks,
      chunkUsageMap: new Map(),
      docCreatedAtMap: new Map([
        ["d1", now],
        ["d2", now],
      ]),
      count: 2,
      now,
      randomFn: alwaysPickFirst,
    });

    const docIds = new Set(result.map((c) => c.documentId));
    expect(docIds.size).toBe(2);
  });
});

describe("frontLoadFreshChunks", () => {
  test("moves fresh document chunks to the front", () => {
    const now = Date.now();
    const freshDocTime = now - 1000;
    const oldDocTime = now - FRESHNESS_DECAY_WINDOW_MS - 1000;

    const chunks = [chunk("c1", "d_old"), chunk("c2", "d_fresh"), chunk("c3", "d_old")];
    const docCreatedAtMap = new Map([
      ["d_old", oldDocTime],
      ["d_fresh", freshDocTime],
    ]);

    const result = frontLoadFreshChunks({ chunks, docCreatedAtMap, now });

    expect(result[0]!._id).toBe("c2");
    expect(result).toHaveLength(3);
  });

  test("preserves order within fresh and non-fresh groups", () => {
    const now = Date.now();
    const freshDocTime = now - 1000;
    const oldDocTime = now - FRESHNESS_DECAY_WINDOW_MS - 1000;

    const chunks = [
      chunk("c1", "d_old"),
      chunk("c2", "d_fresh"),
      chunk("c3", "d_old"),
      chunk("c4", "d_fresh"),
    ];
    const docCreatedAtMap = new Map([
      ["d_old", oldDocTime],
      ["d_fresh", freshDocTime],
    ]);

    const result = frontLoadFreshChunks({ chunks, docCreatedAtMap, now });

    expect(result.map((c) => c._id)).toEqual(["c2", "c4", "c1", "c3"]);
  });

  test("returns all chunks unchanged when none are fresh", () => {
    const now = Date.now();
    const oldDocTime = now - FRESHNESS_DECAY_WINDOW_MS - 1000;

    const chunks = [chunk("c1", "d1"), chunk("c2", "d2")];
    const docCreatedAtMap = new Map([
      ["d1", oldDocTime],
      ["d2", oldDocTime],
    ]);

    const result = frontLoadFreshChunks({ chunks, docCreatedAtMap, now });

    expect(result.map((c) => c._id)).toEqual(["c1", "c2"]);
  });

  test("returns all chunks unchanged when all are fresh", () => {
    const now = Date.now();
    const freshDocTime = now - 1000;

    const chunks = [chunk("c1", "d1"), chunk("c2", "d2")];
    const docCreatedAtMap = new Map([
      ["d1", freshDocTime],
      ["d2", freshDocTime],
    ]);

    const result = frontLoadFreshChunks({ chunks, docCreatedAtMap, now });

    expect(result.map((c) => c._id)).toEqual(["c1", "c2"]);
  });

  test("treats unknown documents as not fresh", () => {
    const now = Date.now();
    const freshDocTime = now - 1000;

    const chunks = [chunk("c1", "d_unknown"), chunk("c2", "d_fresh")];
    const docCreatedAtMap = new Map([["d_fresh", freshDocTime]]);

    const result = frontLoadFreshChunks({ chunks, docCreatedAtMap, now });

    expect(result[0]!._id).toBe("c2");
    expect(result[1]!._id).toBe("c1");
  });

  test("caps fresh chunks to half of maxFresh to preserve diversity", () => {
    const now = Date.now();
    const freshDocTime = now - 1000;
    const oldDocTime = now - FRESHNESS_DECAY_WINDOW_MS - 1000;

    const chunks = [
      chunk("c1", "d_fresh"),
      chunk("c2", "d_fresh"),
      chunk("c3", "d_fresh"),
      chunk("c4", "d_fresh"),
      chunk("c5", "d_old"),
      chunk("c6", "d_old"),
    ];
    const docCreatedAtMap = new Map([
      ["d_fresh", freshDocTime],
      ["d_old", oldDocTime],
    ]);

    const result = frontLoadFreshChunks({ chunks, docCreatedAtMap, now, maxFresh: 4 });

    // With maxFresh=4, cap = floor(4/2) = 2 fresh at front
    // Result: [c1, c2 (fresh, capped at 2), c5, c6 (old), c3, c4 (remaining fresh)]
    expect(result[0]!._id).toBe("c1");
    expect(result[1]!._id).toBe("c2");
    expect(result[2]!._id).toBe("c5");
    expect(result[3]!._id).toBe("c6");
  });
});
