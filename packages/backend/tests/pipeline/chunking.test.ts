import { describe, expect, test } from "vitest";

import { chunkContent, chunkMarkdown } from "../../src/pipeline/chunking";

describe("chunkContent", () => {
  test("returns empty array for blank text", () => {
    expect(chunkContent("")).toEqual([]);
    expect(chunkContent("   ")).toEqual([]);
  });

  test("returns single chunk for short text", () => {
    const text = "Hello world, this is a small paragraph.";
    const chunks = chunkContent(text);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toBe(text);
    expect(chunks[0].tokenCount).toBeGreaterThan(0);
  });

  test("preserves sectionTitle and pageNumber", () => {
    const chunks = chunkContent("Short text", "Intro", 3);
    expect(chunks[0].sectionTitle).toBe("Intro");
    expect(chunks[0].pageNumber).toBe(3);
  });

  test("splits long text into multiple chunks", () => {
    const text = "word ".repeat(2000);
    const chunks = chunkContent(text);
    expect(chunks.length).toBeGreaterThan(1);

    for (const chunk of chunks) {
      expect(chunk.content.length).toBeGreaterThan(0);
      expect(chunk.tokenCount).toBeGreaterThan(0);
    }
  });

  test("chunks have overlap", () => {
    const sentences = Array.from(
      { length: 200 },
      (_, i) => `Sentence number ${i} with some content to fill space.`,
    );
    const text = sentences.join(" ");
    const chunks = chunkContent(text);

    expect(chunks.length).toBeGreaterThan(1);

    for (let i = 1; i < chunks.length; i++) {
      const prevEnd = chunks[i - 1].content.slice(-50);
      const currStart = chunks[i].content.slice(0, 50);
      const hasOverlap =
        prevEnd.includes(currStart.split(" ")[0]) || currStart.includes(prevEnd.split(" ").pop()!);
      expect(hasOverlap).toBe(true);
    }
  });
});

describe("chunkMarkdown", () => {
  test("splits by headings", () => {
    const markdown = `# Introduction

This is the intro section.

## Methods

This is the methods section.

## Results

This is the results section.`;

    const chunks = chunkMarkdown(markdown);

    expect(chunks.length).toBe(3);
    expect(chunks[0].sectionTitle).toBe("Introduction");
    expect(chunks[1].sectionTitle).toBe("Methods");
    expect(chunks[2].sectionTitle).toBe("Results");
  });

  test("handles text without headings as a single chunk", () => {
    const text = "Just a plain paragraph without any markdown headings.";
    const chunks = chunkMarkdown(text);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].sectionTitle).toBeUndefined();
  });

  test("handles paginated markdown with page delimiters", () => {
    const dashes = "-".repeat(48);
    const paginated = `Preamble content\n\n1\n${dashes}\n\n# Page One\n\nContent of page one.\n\n2\n${dashes}\n\n# Page Two\n\nContent of page two.`;

    const chunks = chunkMarkdown(paginated);

    const preambleChunk = chunks.find((c) => c.content.includes("Preamble"));
    expect(preambleChunk?.pageNumber).toBe(1);

    const pageOneChunk = chunks.find((c) => c.sectionTitle === "Page One");
    expect(pageOneChunk?.pageNumber).toBe(1);

    const pageTwoChunk = chunks.find((c) => c.sectionTitle === "Page Two");
    expect(pageTwoChunk?.pageNumber).toBe(2);
  });

  test("large section gets sub-chunked", () => {
    const longContent = "This is a detailed paragraph. ".repeat(500);
    const markdown = `# Very Long Section\n\n${longContent}`;

    const chunks = chunkMarkdown(markdown);
    expect(chunks.length).toBeGreaterThan(1);

    for (const chunk of chunks) {
      expect(chunk.sectionTitle).toBe("Very Long Section");
    }
  });
});
