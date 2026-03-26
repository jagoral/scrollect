import { describe, expect, it, vi } from "vitest";

import { sampleChunks, suggestTagsLogic } from "../../../src/pipeline/logic/tagging";
import { createMockTaggingLlm, createMockTaggingServices } from "./mocks";

describe("sampleChunks", () => {
  it("returns all chunks when count is at or below max", () => {
    const chunks = [1, 2, 3];
    expect(sampleChunks(chunks, 5)).toEqual([1, 2, 3]);
    expect(sampleChunks(chunks, 3)).toEqual([1, 2, 3]);
  });

  it("samples first, evenly-spaced middle, and last from large array", () => {
    const chunks = Array.from({ length: 10 }, (_, i) => i);
    const sampled = sampleChunks(chunks, 5);

    expect(sampled).toHaveLength(5);
    expect(sampled[0]).toBe(0);
    expect(sampled[sampled.length - 1]).toBe(9);
  });

  it("handles exactly maxSamples + 1 elements", () => {
    const chunks = [0, 1, 2, 3, 4, 5];
    const sampled = sampleChunks(chunks, 5);

    expect(sampled).toHaveLength(5);
    expect(sampled[0]).toBe(0);
    expect(sampled[sampled.length - 1]).toBe(5);
  });

  it("returns empty array for empty input", () => {
    expect(sampleChunks([], 5)).toEqual([]);
  });
});

describe("suggestTagsLogic", () => {
  it("samples chunks, builds prompt, and returns validated tags", async () => {
    const llm = createMockTaggingLlm({
      suggestTags: vi.fn().mockResolvedValue({
        tags: ["react", "typescript", "testing"],
        usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120 },
      }),
    });
    const services = createMockTaggingServices({ llm });

    const chunks = [
      { content: "React hooks are great" },
      { content: "TypeScript generics explained" },
      { content: "Unit testing best practices" },
    ];

    const { tags, usage, metrics } = await suggestTagsLogic({
      input: { chunks },
      services,
    });

    expect(tags).toEqual(["react", "typescript", "testing"]);
    expect(usage.totalTokens).toBe(120);
    expect(metrics.sampledChunks).toBe(3);
    expect(metrics.suggestedTags).toBe(3);
    expect(metrics.validTags).toBe(3);

    expect(llm.suggestTags).toHaveBeenCalledOnce();
    const call = vi.mocked(llm.suggestTags).mock.calls[0]![0];
    expect(call.prompt).toContain("Chunk 1:");
    expect(call.prompt).toContain("React hooks are great");
  });

  it("samples down to 5 when given more chunks", async () => {
    const llm = createMockTaggingLlm({
      suggestTags: vi.fn().mockResolvedValue({
        tags: ["tag1"],
        usage: { inputTokens: 50, outputTokens: 10, totalTokens: 60 },
      }),
    });
    const services = createMockTaggingServices({ llm });

    const chunks = Array.from({ length: 10 }, (_, i) => ({
      content: `Chunk content ${i}`,
    }));

    const { metrics } = await suggestTagsLogic({
      input: { chunks },
      services,
    });

    expect(metrics.sampledChunks).toBe(5);
  });

  it("returns empty array when LLM returns no tags", async () => {
    const llm = createMockTaggingLlm({
      suggestTags: vi.fn().mockResolvedValue({
        tags: [],
        usage: { inputTokens: 50, outputTokens: 5, totalTokens: 55 },
      }),
    });
    const services = createMockTaggingServices({ llm });

    const { tags, metrics } = await suggestTagsLogic({
      input: { chunks: [{ content: "some text" }] },
      services,
    });

    expect(tags).toEqual([]);
    expect(metrics.suggestedTags).toBe(0);
    expect(metrics.validTags).toBe(0);
  });

  it("filters out blank and non-string tags", async () => {
    const llm = createMockTaggingLlm({
      suggestTags: vi.fn().mockResolvedValue({
        tags: ["valid", "", "  ", 123 as unknown as string, "also-valid"],
        usage: { inputTokens: 50, outputTokens: 10, totalTokens: 60 },
      }),
    });
    const services = createMockTaggingServices({ llm });

    const { tags, metrics } = await suggestTagsLogic({
      input: { chunks: [{ content: "text" }] },
      services,
    });

    expect(tags).toEqual(["valid", "also-valid"]);
    expect(metrics.suggestedTags).toBe(5);
    expect(metrics.validTags).toBe(2);
  });

  it("truncates chunk content exceeding MAX_CHUNK_CHARS", async () => {
    const llm = createMockTaggingLlm({
      suggestTags: vi.fn().mockResolvedValue({
        tags: ["tag"],
        usage: { inputTokens: 50, outputTokens: 10, totalTokens: 60 },
      }),
    });
    const services = createMockTaggingServices({ llm });

    const longContent = "a".repeat(2000);
    const { tags } = await suggestTagsLogic({
      input: { chunks: [{ content: longContent }] },
      services,
    });

    expect(tags).toEqual(["tag"]);
    const call = vi.mocked(llm.suggestTags).mock.calls[0]![0];
    expect(call.prompt).toContain("...");
    expect(call.prompt.length).toBeLessThan(2000);
  });
});
