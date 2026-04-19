import { describe, expect, it, vi } from "vitest";

import {
  generateHighlightDrafts,
  groupHighlightsBySection,
  matchHighlightToSection,
} from "../../../src/drafting/logic/highlightDraftGeneration";
import type {
  ChunkData,
  HighlightData,
  HighlightDraftInput,
  SectionData,
} from "../../../src/drafting/logic/highlightDraftGeneration";
import { createMockHighlightDraftLlm, createMockHighlightDraftGenerationServices } from "./mocks";

const fakeHash = (content: string) => `hash-${content.slice(0, 60)}`;

function makeHighlight(overrides?: Partial<HighlightData>): HighlightData {
  return {
    _id: "highlight-0",
    text: "This is a highlighted passage from the document that is long enough to match",
    pageNumber: 1,
    ...overrides,
  };
}

function makeSection(overrides?: Partial<SectionData>): SectionData {
  return {
    _id: "section-1",
    sectionTitle: "Introduction",
    summary: "This section introduces the main concepts.",
    chunkStartIndex: 0,
    chunkEndIndex: 2,
    ...overrides,
  };
}

function makeChunk(overrides?: Partial<ChunkData>): ChunkData {
  return {
    _id: "chunk-0",
    content:
      "This is a highlighted passage from the document that is long enough to match. Plus some extra surrounding content.",
    chunkIndex: 0,
    ...overrides,
  };
}

function makeInput(overrides?: Partial<HighlightDraftInput>): HighlightDraftInput {
  return {
    documentId: "doc-1",
    userId: "user-1",
    documentTitle: "Test Document",
    highlights: [
      makeHighlight({ _id: "h-0" }),
      makeHighlight({
        _id: "h-1",
        text: "Another highlighted passage that is also long enough for matching purposes here",
      }),
    ],
    sections: [
      makeSection({ _id: "section-1", chunkStartIndex: 0, chunkEndIndex: 2 }),
      makeSection({
        _id: "section-2",
        sectionTitle: "Methods",
        summary: "Methods section.",
        chunkStartIndex: 3,
        chunkEndIndex: 5,
      }),
    ],
    allChunks: [
      makeChunk({ _id: "chunk-0", chunkIndex: 0 }),
      makeChunk({ _id: "chunk-1", chunkIndex: 1 }),
      makeChunk({ _id: "chunk-2", chunkIndex: 2 }),
      makeChunk({
        _id: "chunk-3",
        chunkIndex: 3,
        content:
          "Another highlighted passage that is also long enough for matching purposes here. With additional context.",
      }),
      makeChunk({ _id: "chunk-4", chunkIndex: 4, content: "Unrelated chunk content." }),
      makeChunk({ _id: "chunk-5", chunkIndex: 5, content: "More unrelated content." }),
    ],
    existingHashes: new Set(),
    hashContent: fakeHash,
    generationBatch: 2,
    ...overrides,
  };
}

describe("matchHighlightToSection", () => {
  const sections = [
    makeSection({ _id: "s1", chunkStartIndex: 0, chunkEndIndex: 2 }),
    makeSection({
      _id: "s2",
      sectionTitle: "Methods",
      chunkStartIndex: 3,
      chunkEndIndex: 5,
    }),
  ];

  const chunks = [
    makeChunk({ _id: "c0", chunkIndex: 0 }),
    makeChunk({ _id: "c3", chunkIndex: 3, content: "Different content in methods section." }),
  ];

  it("matches a highlight to the correct section via chunk content", () => {
    const highlight = makeHighlight({ text: "This is a highlighted passage from the document" });
    const result = matchHighlightToSection({ highlight, sections, allChunks: chunks });
    expect(result?._id).toBe("s1");
  });

  it("returns undefined for highlights shorter than minimum length", () => {
    const highlight = makeHighlight({ text: "short" });
    const result = matchHighlightToSection({ highlight, sections, allChunks: chunks });
    expect(result).toBeUndefined();
  });

  it("returns undefined when highlight text does not appear in any chunk", () => {
    const highlight = makeHighlight({
      text: "This text does not exist in any chunk content at all anywhere",
    });
    const result = matchHighlightToSection({ highlight, sections, allChunks: chunks });
    expect(result).toBeUndefined();
  });

  it("matching is case-insensitive", () => {
    const highlight = makeHighlight({ text: "THIS IS A HIGHLIGHTED PASSAGE FROM THE DOCUMENT" });
    const result = matchHighlightToSection({ highlight, sections, allChunks: chunks });
    expect(result?._id).toBe("s1");
  });
});

describe("groupHighlightsBySection", () => {
  it("groups highlights by their matched section", () => {
    const sections = [
      makeSection({ _id: "s1", chunkStartIndex: 0, chunkEndIndex: 2 }),
      makeSection({ _id: "s2", sectionTitle: "Methods", chunkStartIndex: 3, chunkEndIndex: 5 }),
    ];
    const chunks = [
      makeChunk({ _id: "c0", chunkIndex: 0 }),
      makeChunk({
        _id: "c3",
        chunkIndex: 3,
        content:
          "Methods section chunk with specific content that is long enough to match highlights",
      }),
    ];
    const highlights = [
      makeHighlight({ _id: "h1", text: "This is a highlighted passage from the document" }),
      makeHighlight({ _id: "h2", text: "Methods section chunk with specific content" }),
    ];

    const { groups, unmatchedIds } = groupHighlightsBySection({
      highlights,
      sections,
      allChunks: chunks,
    });

    expect(groups).toHaveLength(2);
    expect(unmatchedIds).toHaveLength(0);

    const s1Group = groups.find((g) => g.section._id === "s1");
    const s2Group = groups.find((g) => g.section._id === "s2");
    expect(s1Group?.highlights).toHaveLength(1);
    expect(s2Group?.highlights).toHaveLength(1);
  });

  it("puts unmatched highlights in unmatchedIds", () => {
    const { groups, unmatchedIds } = groupHighlightsBySection({
      highlights: [
        makeHighlight({
          _id: "h1",
          text: "This text does not appear anywhere in the chunks at all",
        }),
      ],
      sections: [makeSection()],
      allChunks: [makeChunk()],
    });

    expect(groups).toHaveLength(0);
    expect(unmatchedIds).toEqual(["h1"]);
  });

  it("groups multiple highlights matching the same section together", () => {
    const chunks = [
      makeChunk({
        _id: "c0",
        chunkIndex: 0,
        content:
          "First passage content that is long enough. Second passage content that is also long enough.",
      }),
    ];
    const highlights = [
      makeHighlight({ _id: "h1", text: "First passage content that is long enough" }),
      makeHighlight({ _id: "h2", text: "Second passage content that is also long enough" }),
    ];

    const { groups } = groupHighlightsBySection({
      highlights,
      sections: [makeSection()],
      allChunks: chunks,
    });

    expect(groups).toHaveLength(1);
    expect(groups[0]!.highlights).toHaveLength(2);
  });
});

describe("generateHighlightDrafts", () => {
  it("generates one draft per matched highlight", async () => {
    const services = createMockHighlightDraftGenerationServices();
    const result = await generateHighlightDrafts({
      input: makeInput(),
      services,
    });

    expect(result.drafts).toHaveLength(2);
    expect(result.metrics.highlightsInBatch).toBe(2);
    expect(result.metrics.highlightsMatched).toBe(2);
    expect(result.metrics.sectionsAffected).toBe(2);
    expect(result.metrics.draftsProduced).toBe(2);
  });

  it("passes learningGoal through to highlight draft generation", async () => {
    const generateDraftsFromHighlights = vi.fn().mockResolvedValue({
      cards: [
        {
          highlightId: "h-0",
          content: 'Insight from highlight in "Introduction": useful content.',
          postType: "insight",
          typeData: { type: "insight" },
        },
      ],
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        costUsd: { input: 0, output: 0, total: 0 },
      },
    });
    const llm = createMockHighlightDraftLlm({ generateDraftsFromHighlights });
    const services = createMockHighlightDraftGenerationServices({ llm });

    await generateHighlightDrafts({
      input: makeInput({ learningGoal: "Understand how highlight cards are generated" }),
      services,
    });

    expect(generateDraftsFromHighlights).toHaveBeenCalledWith(
      expect.objectContaining({
        learningGoal: "Understand how highlight cards are generated",
      }),
    );
  });

  it("returns empty results for empty highlights array", async () => {
    const services = createMockHighlightDraftGenerationServices();
    const result = await generateHighlightDrafts({
      input: makeInput({ highlights: [] }),
      services,
    });

    expect(result.drafts).toHaveLength(0);
    expect(result.processedHighlightIds).toHaveLength(0);
    expect(result.metrics.highlightsInBatch).toBe(0);
  });

  it("includes unmatched highlight IDs in processedHighlightIds", async () => {
    const services = createMockHighlightDraftGenerationServices();
    const unmatchableHighlight = makeHighlight({
      _id: "h-unmatched",
      text: "This text does not exist in any chunk and should not match anything at all",
    });
    const result = await generateHighlightDrafts({
      input: makeInput({
        highlights: [unmatchableHighlight],
      }),
      services,
    });

    expect(result.processedHighlightIds).toContain("h-unmatched");
    expect(result.drafts).toHaveLength(0);
    expect(result.metrics.highlightsMatched).toBe(0);
  });

  it("deduplicates drafts with same content hash", async () => {
    const llm = createMockHighlightDraftLlm({
      generateDraftsFromHighlights: vi.fn().mockResolvedValue({
        cards: [
          {
            highlightId: "h-0",
            content: "Identical content for dedup test",
            postType: "insight",
            typeData: { type: "insight" },
          },
          {
            highlightId: "h-1",
            content: "Identical content for dedup test",
            postType: "insight",
            typeData: { type: "insight" },
          },
        ],
        usage: {
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          costUsd: { input: 0, output: 0, total: 0 },
        },
      }),
    });
    const services = createMockHighlightDraftGenerationServices({ llm });

    const input = makeInput({
      highlights: [makeHighlight({ _id: "h-0" }), makeHighlight({ _id: "h-1" })],
      sections: [makeSection({ _id: "section-1", chunkStartIndex: 0, chunkEndIndex: 5 })],
    });

    const result = await generateHighlightDrafts({ input, services });

    expect(result.drafts).toHaveLength(1);
    expect(result.metrics.draftsDeduplicated).toBe(1);
  });

  it("skips drafts that already exist in existingHashes", async () => {
    const services = createMockHighlightDraftGenerationServices();
    const input = makeInput();

    const firstResult = await generateHighlightDrafts({ input, services });
    const existingHashes = new Set(firstResult.drafts.map((d) => d.contentHash));

    const secondResult = await generateHighlightDrafts({
      input: makeInput({ existingHashes }),
      services,
    });

    expect(secondResult.drafts).toHaveLength(0);
    expect(secondResult.metrics.draftsDeduplicated).toBe(2);
  });

  it("sets correct metadata on generated drafts", async () => {
    const services = createMockHighlightDraftGenerationServices();
    const result = await generateHighlightDrafts({
      input: makeInput(),
      services,
    });

    for (const draft of result.drafts) {
      expect(draft.documentId).toBe("doc-1");
      expect(draft.userId).toBe("user-1");
      expect(draft.strategy).toBe("highlight");
      expect(draft.generationBatch).toBe(2);
      expect(draft.qualityScore).toBeGreaterThanOrEqual(0.3);
      expect(draft.contentHash).toBeTruthy();
      expect(draft.sourceChunkIds.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("accumulates token usage across section groups", async () => {
    const usage = {
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
      costUsd: { input: 0, output: 0, total: 0 },
    };
    const llm = createMockHighlightDraftLlm({
      generateDraftsFromHighlights: vi.fn().mockImplementation(async (opts) => ({
        cards: opts.highlights.map((h: { highlightId: string; highlightText: string }) => ({
          highlightId: h.highlightId,
          content: `Insight from "${opts.sectionTitle}": ${h.highlightText.slice(0, 50)} with enough content.`,
          postType: "insight",
          typeData: { type: "insight" },
        })),
        usage,
      })),
    });
    const services = createMockHighlightDraftGenerationServices({ llm });

    const result = await generateHighlightDrafts({
      input: makeInput(),
      services,
    });

    expect(result.tokenUsage.inputTokens).toBe(200);
    expect(result.tokenUsage.outputTokens).toBe(100);
    expect(result.tokenUsage.totalTokens).toBe(300);
  });

  it("continues processing other sections when one LLM call fails", async () => {
    let callCount = 0;
    const llm = createMockHighlightDraftLlm({
      generateDraftsFromHighlights: vi.fn().mockImplementation(async (opts) => {
        callCount++;
        if (callCount === 1) throw new Error("LLM failure");
        return {
          cards: opts.highlights.map((h: { highlightId: string; highlightText: string }) => ({
            highlightId: h.highlightId,
            content: `Insight from "${opts.sectionTitle}": ${h.highlightText.slice(0, 50)} with enough length.`,
            postType: "insight",
            typeData: { type: "insight" },
          })),
          usage: {
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            costUsd: { input: 0, output: 0, total: 0 },
          },
        };
      }),
    });
    const services = createMockHighlightDraftGenerationServices({ llm });

    const result = await generateHighlightDrafts({
      input: makeInput(),
      services,
    });

    expect(result.drafts.length).toBeGreaterThanOrEqual(1);
    expect(result.metrics.draftsFailedLlm).toBeGreaterThanOrEqual(1);
  });

  it("discards drafts with empty content", async () => {
    const llm = createMockHighlightDraftLlm({
      generateDraftsFromHighlights: vi.fn().mockResolvedValue({
        cards: [
          {
            highlightId: "h-0",
            content: "",
            postType: "insight",
            typeData: { type: "insight" },
          },
        ],
        usage: {
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          costUsd: { input: 0, output: 0, total: 0 },
        },
      }),
    });
    const services = createMockHighlightDraftGenerationServices({ llm });

    const input = makeInput({
      highlights: [makeHighlight({ _id: "h-0" })],
      sections: [makeSection({ chunkStartIndex: 0, chunkEndIndex: 5 })],
    });

    const result = await generateHighlightDrafts({ input, services });
    expect(result.drafts).toHaveLength(0);
  });

  it("handles highlights with no matching chunks in the section range", async () => {
    const services = createMockHighlightDraftGenerationServices();
    const result = await generateHighlightDrafts({
      input: makeInput({
        highlights: [makeHighlight({ _id: "h-0" })],
        sections: [makeSection({ chunkStartIndex: 100, chunkEndIndex: 200 })],
        allChunks: [makeChunk({ _id: "c0", chunkIndex: 0 })],
      }),
      services,
    });

    expect(result.processedHighlightIds).toContain("h-0");
    expect(result.drafts).toHaveLength(0);
    expect(result.metrics.highlightsMatched).toBe(0);
  });
});
