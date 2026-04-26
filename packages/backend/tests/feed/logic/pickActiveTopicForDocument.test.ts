import { describe, expect, it } from "vitest";

import { pickActiveTopicForDocument } from "../../../src/feed/logic/pickActiveTopicForDocument";

describe("pickActiveTopicForDocument", () => {
  it("returns undefined for empty input", () => {
    expect(pickActiveTopicForDocument([])).toBeUndefined();
  });

  it("returns the only assignment when one exists", () => {
    expect(pickActiveTopicForDocument([{ topicId: "t1", createdAt: 100 }])).toBe("t1");
  });

  it("returns the most-recent assignment among multiple", () => {
    const assignments = [
      { topicId: "t1", createdAt: 100 },
      { topicId: "t2", createdAt: 300 },
      { topicId: "t3", createdAt: 200 },
    ];
    expect(pickActiveTopicForDocument(assignments)).toBe("t2");
  });

  it("on tied timestamps, breaks the tie by higher topicId (deterministic across row order)", () => {
    expect(
      pickActiveTopicForDocument([
        { topicId: "first", createdAt: 100 },
        { topicId: "second", createdAt: 100 },
      ]),
    ).toBe("second");
    // Same input in reversed order should still produce the same answer.
    expect(
      pickActiveTopicForDocument([
        { topicId: "second", createdAt: 100 },
        { topicId: "first", createdAt: 100 },
      ]),
    ).toBe("second");
  });

  it("breaks three-way ties deterministically", () => {
    expect(
      pickActiveTopicForDocument([
        { topicId: "a", createdAt: 100 },
        { topicId: "b", createdAt: 100 },
        { topicId: "c", createdAt: 100 },
      ]),
    ).toBe("c");
  });

  it("handles unsorted input", () => {
    const assignments = [
      { topicId: "old", createdAt: 50 },
      { topicId: "newest", createdAt: 999 },
      { topicId: "middle", createdAt: 200 },
    ];
    expect(pickActiveTopicForDocument(assignments)).toBe("newest");
  });
});
