import { describe, expect, it, vi } from "vitest";

import { embedTopicGoal } from "../../src/topics/embedTopicGoal";
import type { TopicEmbeddingServiceContext } from "../../src/providers/types";
import { createMockEmbedder } from "../feed/logic/mocks";

function makeCtx(overrides?: Partial<TopicEmbeddingServiceContext>): TopicEmbeddingServiceContext {
  return {
    embedder: createMockEmbedder(),
    ...overrides,
  };
}

describe("embedTopicGoal", () => {
  it("returns skipped:empty_goal for blank goal", async () => {
    const result = await embedTopicGoal(makeCtx(), { topicId: "t1", learningGoal: "   " });
    expect(result).toEqual({ skipped: "empty_goal" });
  });

  it("returns skipped:empty_vector when embedder returns an empty array", async () => {
    const result = await embedTopicGoal(
      makeCtx({ embedder: createMockEmbedder({ embed: async () => [] }) }),
      { topicId: "t1", learningGoal: "Learn Convex" },
    );
    expect(result).toEqual({ skipped: "empty_vector" });
  });

  it("returns skipped:empty_vector when embedder returns an empty vector", async () => {
    const result = await embedTopicGoal(
      makeCtx({ embedder: createMockEmbedder({ embed: async () => [[]] }) }),
      { topicId: "t1", learningGoal: "Learn Convex" },
    );
    expect(result).toEqual({ skipped: "empty_vector" });
  });

  it("returns embedding on success", async () => {
    const embed = vi.fn(async (texts: string[]) => texts.map(() => [1, 2, 3]));
    const result = await embedTopicGoal(makeCtx({ embedder: createMockEmbedder({ embed }) }), {
      topicId: "t1",
      learningGoal: "  Learn DDD  ",
    });
    expect(result).toEqual({ embedding: [1, 2, 3] });
    expect(embed).toHaveBeenCalledWith(["Learn DDD"]);
  });

  it("propagates provider errors to the caller", async () => {
    const embed = vi.fn(async () => {
      throw new Error("embedder down");
    });
    await expect(
      embedTopicGoal(makeCtx({ embedder: createMockEmbedder({ embed }) }), {
        topicId: "t1",
        learningGoal: "Learn DDD",
      }),
    ).rejects.toThrow("embedder down");
  });
});
