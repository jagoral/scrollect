import { describe, expect, it } from "vitest";

import { mergeUnreadPostIds, pruneStore, uniquePostIds } from "../use-feed-unread-posts";

describe("feed unread post helpers", () => {
  it("deduplicates post ids while keeping the first occurrence", () => {
    expect(uniquePostIds(["post-a", "post-b", "post-a", "", "post-c"])).toEqual([
      "post-a",
      "post-b",
      "post-c",
    ]);
  });

  it("keeps newly generated ids before older unread ids", () => {
    expect(mergeUnreadPostIds(["old-a", "old-b"], ["new-a", "old-a", "new-b"])).toEqual([
      "new-a",
      "old-a",
      "new-b",
      "old-b",
    ]);
  });

  it("drops invalid and stale scope entries from storage", () => {
    const now = new Date("2026-04-20T12:00:00.000Z").getTime();
    const staleCreatedAt = now - 8 * 24 * 60 * 60 * 1000;

    expect(
      pruneStore(
        {
          all: { postIds: ["post-a", "post-a"], createdAt: now },
          "document:doc-a": { postIds: ["post-b"], createdAt: staleCreatedAt },
          broken: { postIds: "post-c", createdAt: now },
        },
        now,
      ),
    ).toEqual({
      all: { postIds: ["post-a"], createdAt: now },
    });
  });
});
