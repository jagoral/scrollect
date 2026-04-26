import { describe, expect, it, vi } from "vitest";

import { deleteRemainingUserDataLogic } from "../../convex/access/account";

type Row = { _id: string; userId: string };

/**
 * Stub for the slice of `ctx.db` that `deleteRemainingUserDataLogic` exercises:
 *  - `query(table).withIndex(name, fn).collect()`
 *  - `delete(id)`
 *
 * Returns a deletion log so the test can assert exactly which rows were removed.
 */
function makeCtx(perTable: Record<string, Row[]>) {
  const deleted: string[] = [];
  return {
    deleted,
    ctx: {
      db: {
        query: (table: string) => ({
          withIndex: (_name: string, _fn: unknown) => ({
            collect: async () => perTable[table] ?? [],
          }),
        }),
        delete: vi.fn(async (id: string) => {
          deleted.push(id);
        }),
      },
    } as unknown as Parameters<typeof deleteRemainingUserDataLogic>[0],
  };
}

describe("deleteRemainingUserDataLogic", () => {
  it("deletes topics, documentTopics, and pushTokens together with the other user-owned rows", async () => {
    const userId = "user-1";
    const { ctx, deleted } = makeCtx({
      bookmarks: [{ _id: "bm-1", userId }],
      bookmarkLists: [{ _id: "bl-1", userId }],
      tags: [{ _id: "tag-1", userId }],
      reactionFeedback: [{ _id: "rf-1", userId }],
      entitlementGrants: [{ _id: "eg-1", userId }],
      topics: [
        { _id: "topic-1", userId },
        { _id: "topic-2", userId },
      ],
      documentTopics: [
        { _id: "dt-1", userId },
        { _id: "dt-2", userId },
        { _id: "dt-3", userId },
      ],
      pushTokens: [
        { _id: "pt-1", userId },
        { _id: "pt-2", userId },
      ],
    });

    const result = await deleteRemainingUserDataLogic(ctx, { userId });

    expect(result).toEqual({
      deletedBookmarks: 1,
      deletedBookmarkLists: 1,
      deletedTags: 1,
      deletedReactionFeedback: 1,
      deletedEntitlementGrants: 1,
      deletedTopics: 2,
      deletedDocumentTopics: 3,
      deletedPushTokens: 2,
    });

    expect(deleted).toContain("topic-1");
    expect(deleted).toContain("topic-2");
    expect(deleted).toContain("dt-1");
    expect(deleted).toContain("dt-2");
    expect(deleted).toContain("dt-3");
    expect(deleted).toContain("pt-1");
    expect(deleted).toContain("pt-2");
  });

  it("returns zero counts and deletes nothing when the user has no rows", async () => {
    const { ctx, deleted } = makeCtx({});

    const result = await deleteRemainingUserDataLogic(ctx, { userId: "no-rows" });

    expect(result).toEqual({
      deletedBookmarks: 0,
      deletedBookmarkLists: 0,
      deletedTags: 0,
      deletedReactionFeedback: 0,
      deletedEntitlementGrants: 0,
      deletedTopics: 0,
      deletedDocumentTopics: 0,
      deletedPushTokens: 0,
    });
    expect(deleted).toHaveLength(0);
  });
});
