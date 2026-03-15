import { describe, expect, test } from "bun:test";

import {
  buildChunkUsageMap,
  buildTypeCoverageHint,
  computeRecencyBoost,
  weightedSample,
} from "../convex/feed/sampling";
import type { ChunkInfo, PostSourceRecord } from "../convex/feed/sampling";

const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

const chunk = (id: string, docId: string, section?: string): ChunkInfo => ({
  _id: id,
  content: `content-${id}`,
  documentId: docId,
  documentTitle: `Doc ${docId}`,
  sectionTitle: section,
});

describe("computeRecencyBoost", () => {
  test("returns 2.0 for documents less than 48 hours old", () => {
    const now = Date.now();
    const docCreatedAt = now - FORTY_EIGHT_HOURS_MS + 1000;
    expect(computeRecencyBoost(docCreatedAt, now)).toBe(2.0);
  });

  test("returns 1.0 for documents older than 7 days", () => {
    const now = Date.now();
    const docCreatedAt = now - SEVEN_DAYS_MS - 1000;
    expect(computeRecencyBoost(docCreatedAt, now)).toBe(1.0);
  });

  test("returns interpolated value between 48h and 7 days", () => {
    const now = Date.now();
    const midAge = (FORTY_EIGHT_HOURS_MS + SEVEN_DAYS_MS) / 2;
    const docCreatedAt = now - midAge;
    const result = computeRecencyBoost(docCreatedAt, now);
    expect(result).toBeGreaterThan(1.0);
    expect(result).toBeLessThan(2.0);
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
