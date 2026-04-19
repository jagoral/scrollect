import { describe, expect, it, vi } from "vitest";

import {
  discoverThemes,
  generateThematicDrafts,
} from "../../../src/drafting/logic/thematicDraftGeneration";
import type {
  Theme,
  ThematicDraftInput,
} from "../../../src/drafting/logic/thematicDraftGeneration";
import {
  createMockPostDraftLlm,
  createMockThematicDraftGenerationServices,
  createMockThematicLlm,
  createMockEmbedder,
  createMockVectorStore,
} from "./mocks";
import type { VectorSearchResult } from "../../../src/providers/types";

const fakeHash = (content: string) => `hash-${content.slice(0, 20)}`;

const SECTION_SUMMARIES = [
  { sectionTitle: "Introduction", summary: "Introduces the main concepts of testing." },
  { sectionTitle: "Architecture", summary: "Describes the layered architecture pattern." },
  { sectionTitle: "Implementation", summary: "Walks through the implementation details." },
];

const THEMES: Theme[] = [
  {
    title: "Design Patterns",
    description: "Patterns that appear across architecture and implementation.",
    relevantSections: ["Architecture", "Implementation"],
  },
];

function makeChunkContentMap(): Map<string, string> {
  return new Map([
    ["chunk-1", "Content about testing fundamentals and best practices."],
    ["chunk-2", "Content about architecture layers and separation of concerns."],
    ["chunk-3", "Content about implementation strategies and code organization."],
  ]);
}

function makeSearchResults(): VectorSearchResult[] {
  return [
    {
      id: "v1",
      score: 0.95,
      payload: { chunkId: "chunk-1", documentId: "doc-1", chunkIndex: 0, userId: "user-1" },
    },
    {
      id: "v2",
      score: 0.9,
      payload: { chunkId: "chunk-2", documentId: "doc-1", chunkIndex: 1, userId: "user-1" },
    },
    {
      id: "v3",
      score: 0.85,
      payload: { chunkId: "chunk-3", documentId: "doc-1", chunkIndex: 2, userId: "user-1" },
    },
  ];
}

function makeInput(overrides?: Partial<ThematicDraftInput>): ThematicDraftInput {
  return {
    documentId: "doc-1",
    userId: "user-1",
    documentTitle: "Test Document",
    themes: THEMES,
    sectionSummaries: SECTION_SUMMARIES,
    chunkContentMap: makeChunkContentMap(),
    existingHashes: new Set(),
    hashContent: fakeHash,
    ...overrides,
  };
}

describe("discoverThemes", () => {
  it("returns themes from the thematic LLM", async () => {
    const thematicLlm = createMockThematicLlm();
    const result = await discoverThemes({
      input: {
        sectionSummaries: SECTION_SUMMARIES,
        documentTitle: "Test Document",
      },
      services: { thematicLlm },
    });

    expect(result.themes.length).toBeGreaterThan(0);
    expect(result.themes[0]!.title).toBeTruthy();
    expect(result.themes[0]!.relevantSections.length).toBeGreaterThanOrEqual(2);
  });

  it("propagates LLM usage", async () => {
    const thematicLlm = createMockThematicLlm({
      discoverThemes: async () => ({
        themes: [{ title: "Theme", description: "Desc", relevantSections: ["A", "B"] }],
        usage: {
          inputTokens: 500,
          outputTokens: 200,
          totalTokens: 700,
          costUsd: { input: 0, output: 0, total: 0 },
        },
      }),
    });

    const result = await discoverThemes({
      input: { sectionSummaries: SECTION_SUMMARIES, documentTitle: "Test" },
      services: { thematicLlm },
    });

    expect(result.usage.totalTokens).toBe(700);
  });

  it("passes learningGoal through to thematic discovery", async () => {
    const discoverThemesSpy = vi.fn().mockResolvedValue({
      themes: [{ title: "Theme", description: "Desc", relevantSections: ["A", "B"] }],
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        costUsd: { input: 0, output: 0, total: 0 },
      },
    });
    const thematicLlm = createMockThematicLlm({ discoverThemes: discoverThemesSpy });

    await discoverThemes({
      input: {
        sectionSummaries: SECTION_SUMMARIES,
        documentTitle: "Test",
        learningGoal: "Learn how architecture patterns fit together",
      },
      services: { thematicLlm },
    });

    expect(discoverThemesSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        learningGoal: "Learn how architecture patterns fit together",
      }),
    );
  });
});

describe("generateThematicDrafts", () => {
  it("generates drafts for each theme with insight and summary card types", async () => {
    const vectorStore = createMockVectorStore({
      search: async (): Promise<VectorSearchResult[]> => makeSearchResults(),
    });
    const services = createMockThematicDraftGenerationServices({ vectorStore });

    const result = await generateThematicDrafts({
      input: makeInput(),
      services,
    });

    expect(result.drafts.length).toBe(2);
    const types = result.drafts.map((d) => d.postType);
    expect(types).toContain("insight");
    expect(types).toContain("summary");
  });

  it("sets strategy to thematic and sectionSummaryId to undefined", async () => {
    const vectorStore = createMockVectorStore({
      search: async (): Promise<VectorSearchResult[]> => makeSearchResults(),
    });
    const services = createMockThematicDraftGenerationServices({ vectorStore });

    const result = await generateThematicDrafts({
      input: makeInput(),
      services,
    });

    for (const draft of result.drafts) {
      expect(draft.strategy).toBe("thematic");
      expect(draft.sectionSummaryId).toBeUndefined();
      expect(draft.generationBatch).toBe(1);
    }
  });

  it("returns empty drafts when no themes provided", async () => {
    const services = createMockThematicDraftGenerationServices();

    const result = await generateThematicDrafts({
      input: makeInput({ themes: [] }),
      services,
    });

    expect(result.drafts).toHaveLength(0);
    expect(result.metrics.themesDiscovered).toBe(0);
  });

  it("returns empty drafts when vector search returns no results", async () => {
    const vectorStore = createMockVectorStore({
      search: async (): Promise<VectorSearchResult[]> => [],
    });
    const services = createMockThematicDraftGenerationServices({ vectorStore });

    const result = await generateThematicDrafts({
      input: makeInput(),
      services,
    });

    expect(result.drafts).toHaveLength(0);
  });

  it("deduplicates drafts with identical content hash", async () => {
    const vectorStore = createMockVectorStore({
      search: async (): Promise<VectorSearchResult[]> => makeSearchResults(),
    });
    const draftLlm = createMockPostDraftLlm({
      generateDraft: vi.fn().mockResolvedValue({
        card: {
          content: "Identical thematic content for all types",
          typeData: { type: "insight" },
        },
        usage: {
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          costUsd: { input: 0, output: 0, total: 0 },
        },
      }),
    });
    const services = createMockThematicDraftGenerationServices({ vectorStore, draftLlm });

    const result = await generateThematicDrafts({
      input: makeInput(),
      services,
    });

    expect(result.drafts).toHaveLength(1);
    expect(result.metrics.draftsDeduplicated).toBe(1);
  });

  it("skips drafts that already exist in existingHashes", async () => {
    const vectorStore = createMockVectorStore({
      search: async (): Promise<VectorSearchResult[]> => makeSearchResults(),
    });
    const services = createMockThematicDraftGenerationServices({ vectorStore });

    const firstResult = await generateThematicDrafts({
      input: makeInput(),
      services,
    });
    const existingHashes = new Set(firstResult.drafts.map((d) => d.contentHash));

    const secondResult = await generateThematicDrafts({
      input: makeInput({ existingHashes }),
      services,
    });

    expect(secondResult.drafts).toHaveLength(0);
    expect(secondResult.metrics.draftsDeduplicated).toBe(2);
  });

  it("continues generating when one LLM call fails", async () => {
    const vectorStore = createMockVectorStore({
      search: async (): Promise<VectorSearchResult[]> => makeSearchResults(),
    });
    const draftLlm = createMockPostDraftLlm({
      generateDraft: vi
        .fn()
        .mockImplementation(
          async (opts: { postType: string; sectionTitle: string; learningGoal?: string }) => {
            if (opts.postType === "insight") throw new Error("LLM failure");
            return {
              card: {
                content: `Draft ${opts.postType} for "${opts.sectionTitle}": useful thematic card content here.`,
                typeData: { type: "summary", bulletPoints: ["Point 1", "Point 2"] },
              },
              usage: {
                inputTokens: 0,
                outputTokens: 0,
                totalTokens: 0,
                costUsd: { input: 0, output: 0, total: 0 },
              },
            };
          },
        ),
    });
    const services = createMockThematicDraftGenerationServices({ vectorStore, draftLlm });

    const result = await generateThematicDrafts({
      input: makeInput(),
      services,
    });

    expect(result.drafts.length).toBe(1);
    expect(result.metrics.draftsFailedLlm).toBe(1);
  });

  it("isolates individual theme failures", async () => {
    const callCount = { n: 0 };
    const vectorStore = createMockVectorStore({
      search: async (): Promise<VectorSearchResult[]> => makeSearchResults(),
    });
    const embedder = createMockEmbedder({
      embed: async (texts: string[]) => {
        callCount.n++;
        if (callCount.n === 1) throw new Error("Embedding failure for first theme");
        return texts.map(() => [0.1, 0.2, 0.3]);
      },
    });

    const twoThemes: Theme[] = [
      {
        title: "Failing Theme",
        description: "This will fail.",
        relevantSections: ["Introduction", "Architecture"],
      },
      {
        title: "Working Theme",
        description: "This will succeed.",
        relevantSections: ["Architecture", "Implementation"],
      },
    ];
    const services = createMockThematicDraftGenerationServices({ vectorStore, embedder });

    const result = await generateThematicDrafts({
      input: makeInput({ themes: twoThemes }),
      services,
    });

    expect(result.metrics.themesFailed).toBe(1);
    expect(result.metrics.themesProcessed).toBe(1);
    expect(result.drafts.length).toBeGreaterThan(0);
  });

  it("accumulates token usage across themes and card types", async () => {
    const usage = {
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
      costUsd: { input: 0, output: 0, total: 0 },
    };
    const vectorStore = createMockVectorStore({
      search: async (): Promise<VectorSearchResult[]> => makeSearchResults(),
    });
    const draftLlm = createMockPostDraftLlm({
      generateDraft: vi
        .fn()
        .mockImplementation(
          async (opts: { postType: string; sectionTitle: string; learningGoal?: string }) => ({
            card: {
              content: `Draft ${opts.postType} for "${opts.sectionTitle}": useful thematic card content.`,
              typeData:
                opts.postType === "summary"
                  ? { type: "summary", bulletPoints: ["Point 1", "Point 2"] }
                  : { type: "insight" },
            },
            usage,
          }),
        ),
    });
    const services = createMockThematicDraftGenerationServices({ vectorStore, draftLlm });

    const result = await generateThematicDrafts({
      input: makeInput(),
      services,
    });

    expect(result.tokenUsage.inputTokens).toBe(200);
    expect(result.tokenUsage.outputTokens).toBe(100);
    expect(result.tokenUsage.totalTokens).toBe(300);
  });

  it("uses sourceChunkIds from vector search results", async () => {
    const vectorStore = createMockVectorStore({
      search: async (): Promise<VectorSearchResult[]> => makeSearchResults(),
    });
    const services = createMockThematicDraftGenerationServices({ vectorStore });

    const result = await generateThematicDrafts({
      input: makeInput(),
      services,
    });

    for (const draft of result.drafts) {
      expect(draft.sourceChunkIds).toEqual(["chunk-1", "chunk-2", "chunk-3"]);
    }
  });

  it("passes learningGoal through to thematic draft generation", async () => {
    const vectorStore = createMockVectorStore({
      search: async (): Promise<VectorSearchResult[]> => makeSearchResults(),
    });
    const generateDraft = vi.fn().mockResolvedValue({
      card: {
        content: "Draft insight for testing: a useful thematic card.",
        typeData: { type: "insight" },
      },
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        costUsd: { input: 0, output: 0, total: 0 },
      },
    });
    const draftLlm = createMockPostDraftLlm({ generateDraft });
    const services = createMockThematicDraftGenerationServices({ vectorStore, draftLlm });

    await generateThematicDrafts({
      input: makeInput({ learningGoal: "Understand architecture tradeoffs" }),
      services,
    });

    expect(generateDraft).toHaveBeenCalledWith(
      expect.objectContaining({ learningGoal: "Understand architecture tradeoffs" }),
    );
  });

  it("skips chunks not found in content map", async () => {
    const vectorStore = createMockVectorStore({
      search: async (): Promise<VectorSearchResult[]> => [
        {
          id: "v1",
          score: 0.95,
          payload: { chunkId: "chunk-1", documentId: "doc-1", chunkIndex: 0, userId: "user-1" },
        },
        {
          id: "v-missing",
          score: 0.9,
          payload: {
            chunkId: "missing-chunk",
            documentId: "doc-1",
            chunkIndex: 99,
            userId: "user-1",
          },
        },
      ],
    });
    const services = createMockThematicDraftGenerationServices({ vectorStore });

    const result = await generateThematicDrafts({
      input: makeInput(),
      services,
    });

    for (const draft of result.drafts) {
      expect(draft.sourceChunkIds).toEqual(["chunk-1"]);
    }
  });

  it("passes documentId filter to vector store search", async () => {
    const searchSpy = vi.fn().mockResolvedValue(makeSearchResults());
    const vectorStore = createMockVectorStore({ search: searchSpy });
    const services = createMockThematicDraftGenerationServices({ vectorStore });

    await generateThematicDrafts({
      input: makeInput(),
      services,
    });

    expect(searchSpy).toHaveBeenCalledWith(
      expect.any(Array),
      { userId: "user-1", documentId: "doc-1" },
      3,
    );
  });
});
