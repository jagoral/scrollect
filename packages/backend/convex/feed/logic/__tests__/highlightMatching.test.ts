import { describe, expect, it } from "vitest";

import { matchHighlightsToChunks } from "../highlightMatching";
import type { HighlightLike } from "../generateFeed";
import type { ChunkMetadata } from "../selectionLogic";

const makeChunk = (id: string, documentId: string): ChunkMetadata => ({
  _id: id,
  documentId,
  documentTitle: "Doc",
});

const makeHighlight = (documentId: string, text: string): HighlightLike => ({
  documentId,
  text,
});

const makeContent = (id: string, content: string) => ({ id, content });

describe("matchHighlightsToChunks", () => {
  it("returns undefined when highlights array is empty", () => {
    const result = matchHighlightsToChunks({
      highlights: [],
      allChunks: [makeChunk("c1", "d1")],
      chunkContents: [makeContent("c1", "some content here")],
    });

    expect(result).toBeUndefined();
  });

  it("returns undefined when all highlights are below minimum length", () => {
    const result = matchHighlightsToChunks({
      highlights: [makeHighlight("d1", "short")],
      allChunks: [makeChunk("c1", "d1")],
      chunkContents: [makeContent("c1", "short content")],
    });

    expect(result).toBeUndefined();
  });

  it("matches highlights to chunks case-insensitively", () => {
    const highlightText = "This Is A Long Enough Highlight Text";
    const result = matchHighlightsToChunks({
      highlights: [makeHighlight("d1", highlightText)],
      allChunks: [makeChunk("c1", "d1")],
      chunkContents: [makeContent("c1", "prefix this is a long enough highlight text suffix")],
    });

    expect(result).toEqual(new Set(["c1"]));
  });

  it("excludes chunks from non-highlighted documents", () => {
    const highlightText = "a sufficiently long highlight text here";
    const result = matchHighlightsToChunks({
      highlights: [makeHighlight("d1", highlightText)],
      allChunks: [makeChunk("c1", "d1"), makeChunk("c2", "d2")],
      chunkContents: [
        makeContent("c1", `contains ${highlightText} inside`),
        makeContent("c2", `also contains ${highlightText} inside`),
      ],
    });

    expect(result).toEqual(new Set(["c1"]));
  });

  it("returns correct chunk IDs when multiple chunks match", () => {
    const highlightText = "a sufficiently long highlight text here";
    const result = matchHighlightsToChunks({
      highlights: [makeHighlight("d1", highlightText)],
      allChunks: [makeChunk("c1", "d1"), makeChunk("c2", "d1"), makeChunk("c3", "d1")],
      chunkContents: [
        makeContent("c1", `first ${highlightText} chunk`),
        makeContent("c2", "no match in this chunk at all"),
        makeContent("c3", `third ${highlightText} chunk`),
      ],
    });

    expect(result).toEqual(new Set(["c1", "c3"]));
  });

  it("returns undefined when no chunks match any highlight", () => {
    const result = matchHighlightsToChunks({
      highlights: [makeHighlight("d1", "a long highlight that will not be found anywhere")],
      allChunks: [makeChunk("c1", "d1")],
      chunkContents: [makeContent("c1", "completely different content in this chunk")],
    });

    expect(result).toBeUndefined();
  });

  it("returns undefined when highlighted documents have no chunks", () => {
    const result = matchHighlightsToChunks({
      highlights: [makeHighlight("d1", "a sufficiently long highlight text here")],
      allChunks: [makeChunk("c1", "d2")],
      chunkContents: [makeContent("c1", "a sufficiently long highlight text here")],
    });

    expect(result).toBeUndefined();
  });
});
