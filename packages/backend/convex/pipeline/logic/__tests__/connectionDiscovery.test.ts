import { describe, expect, it, vi } from "vitest";

import { discoverConnections, buildPairKey, orderPair } from "../connectionDiscovery";
import type { ConnectionDiscoveryInput, SectionData, ChunkData } from "../connectionDiscovery";
import type { SummarySearchResult } from "../../../providers/types";
import {
  createMockConnectionDiscoveryLlm,
  createMockConnectionDiscoveryServices,
  createMockSummaryStore,
} from "./mocks";

const fakeHash = (content: string) => `hash-${content.slice(0, 20)}`;

function makeSectionData(overrides?: Partial<SectionData>): SectionData {
  return {
    sectionSummaryId: "section-a1",
    documentId: "doc-a",
    sectionTitle: "Section A1",
    summary: "Summary of section A1",
    embeddingId: "emb-a1",
    chunkStartIndex: 0,
    chunkEndIndex: 2,
    ...overrides,
  };
}

function makeChunks(): ChunkData[] {
  return [
    {
      _id: "chunk-a1-0",
      content: "Content from doc A section 1 chunk 0",
      chunkIndex: 0,
      documentId: "doc-a",
    },
    {
      _id: "chunk-a1-1",
      content: "Content from doc A section 1 chunk 1",
      chunkIndex: 1,
      documentId: "doc-a",
    },
    {
      _id: "chunk-a1-2",
      content: "Content from doc A section 1 chunk 2",
      chunkIndex: 2,
      documentId: "doc-a",
    },
    {
      _id: "chunk-a2-0",
      content: "Content from doc A section 2 chunk 0",
      chunkIndex: 3,
      documentId: "doc-a",
    },
    {
      _id: "chunk-a2-1",
      content: "Content from doc A section 2 chunk 1",
      chunkIndex: 4,
      documentId: "doc-a",
    },
    {
      _id: "chunk-b1-0",
      content: "Content from doc B section 1 chunk 0",
      chunkIndex: 0,
      documentId: "doc-b",
    },
    {
      _id: "chunk-b1-1",
      content: "Content from doc B section 1 chunk 1",
      chunkIndex: 1,
      documentId: "doc-b",
    },
  ];
}

function makeSections(): Map<string, SectionData> {
  return new Map([
    ["section-a1", makeSectionData()],
    [
      "section-a2",
      makeSectionData({
        sectionSummaryId: "section-a2",
        sectionTitle: "Section A2",
        summary: "Summary of section A2",
        embeddingId: "emb-a2",
        chunkStartIndex: 3,
        chunkEndIndex: 4,
      }),
    ],
    [
      "section-b1",
      makeSectionData({
        sectionSummaryId: "section-b1",
        documentId: "doc-b",
        sectionTitle: "Section B1",
        summary: "Summary of section B1",
        embeddingId: "emb-b1",
        chunkStartIndex: 0,
        chunkEndIndex: 1,
      }),
    ],
  ]);
}

function makeDocuments(): Map<string, { documentId: string; title: string }> {
  return new Map([
    ["doc-a", { documentId: "doc-a", title: "Document A" }],
    ["doc-b", { documentId: "doc-b", title: "Document B" }],
  ]);
}

function makeEmbeddings(): Map<string, number[]> {
  return new Map([
    ["section-a1", [0.1, 0.2, 0.3]],
    ["section-a2", [0.4, 0.5, 0.6]],
  ]);
}

function makeCrossDocSearchResults(): SummarySearchResult[] {
  return [
    {
      id: "emb-b1",
      score: 0.85,
      payload: {
        documentId: "doc-b",
        userId: "user-1",
        summaryType: "section" as const,
        sectionTitle: "Section B1",
      },
    },
  ];
}

function makeInput(overrides?: Partial<ConnectionDiscoveryInput>): ConnectionDiscoveryInput {
  return {
    userId: "user-1",
    newDocument: { documentId: "doc-a", title: "Document A" },
    newDocumentSections: [
      makeSectionData(),
      makeSectionData({
        sectionSummaryId: "section-a2",
        sectionTitle: "Section A2",
        summary: "Summary of section A2",
        embeddingId: "emb-a2",
        chunkStartIndex: 3,
        chunkEndIndex: 4,
      }),
    ],
    allDocuments: makeDocuments(),
    allSections: makeSections(),
    allChunks: makeChunks(),
    sectionEmbeddings: makeEmbeddings(),
    existingPairKeys: new Set(),
    hashContent: fakeHash,
    existingDraftHashes: new Set(),
    ...overrides,
  };
}

describe("buildPairKey / orderPair", () => {
  it("produces consistent key regardless of order", () => {
    expect(buildPairKey("section-a1", "section-b1")).toBe(buildPairKey("section-b1", "section-a1"));
  });

  it("orders IDs lexicographically", () => {
    const [a, b] = orderPair("z-id", "a-id");
    expect(a).toBe("a-id");
    expect(b).toBe("z-id");
  });
});

describe("discoverConnections", () => {
  it("discovers cross-document connections via summary store search", async () => {
    const summaryStore = createMockSummaryStore({
      search: vi.fn().mockResolvedValue(makeCrossDocSearchResults()),
    });
    const services = createMockConnectionDiscoveryServices({ summaryStore });

    const result = await discoverConnections({ input: makeInput(), services });

    expect(result.drafts.length).toBeGreaterThan(0);
    expect(result.pairs.length).toBeGreaterThan(0);
    expect(result.pairs[0]!.connectionType).toBe("cross_document");
    expect(result.metrics.withinDocumentFallback).toBe(false);
  });

  it("generates connection drafts with correct strategy and card type", async () => {
    const summaryStore = createMockSummaryStore({
      search: vi.fn().mockResolvedValue(makeCrossDocSearchResults()),
    });
    const services = createMockConnectionDiscoveryServices({ summaryStore });

    const result = await discoverConnections({ input: makeInput(), services });

    for (const draft of result.drafts) {
      expect(draft.strategy).toBe("connection");
      expect(draft.cardType).toBe("connection");
      expect(draft.typeData.type).toBe("connection");
      expect(draft.typeData.sourceATitleHint).toBeTruthy();
      expect(draft.typeData.sourceBTitleHint).toBeTruthy();
    }
  });

  it("includes sourceChunkIds from both sections", async () => {
    const summaryStore = createMockSummaryStore({
      search: vi.fn().mockResolvedValue(makeCrossDocSearchResults()),
    });
    const services = createMockConnectionDiscoveryServices({ summaryStore });

    const result = await discoverConnections({ input: makeInput(), services });

    expect(result.drafts.length).toBeGreaterThan(0);
    for (const draft of result.drafts) {
      expect(draft.sourceChunkIds.length).toBeGreaterThanOrEqual(2);
      const hasChunkFromA = draft.sourceChunkIds.some((id) => id.startsWith("chunk-a"));
      const hasChunkFromB = draft.sourceChunkIds.some((id) => id.startsWith("chunk-b"));
      expect(hasChunkFromA).toBe(true);
      expect(hasChunkFromB).toBe(true);
    }
  });

  it("deduplicates pairs by key (A-B same as B-A)", async () => {
    const summaryStore = createMockSummaryStore({
      search: vi.fn().mockResolvedValue(makeCrossDocSearchResults()),
    });
    const services = createMockConnectionDiscoveryServices({ summaryStore });

    const result = await discoverConnections({ input: makeInput(), services });

    const pairKeys = result.pairs.map((p) =>
      buildPairKey(p.sectionSummaryIdA, p.sectionSummaryIdB),
    );
    const uniqueKeys = new Set(pairKeys);
    expect(pairKeys.length).toBe(uniqueKeys.size);
  });

  it("skips pairs below similarity threshold", async () => {
    const summaryStore = createMockSummaryStore({
      search: vi.fn().mockResolvedValue([
        {
          id: "emb-b1",
          score: 0.5,
          payload: {
            documentId: "doc-b",
            userId: "user-1",
            summaryType: "section" as const,
            sectionTitle: "Section B1",
          },
        },
      ]),
    });
    const services = createMockConnectionDiscoveryServices({ summaryStore });

    const result = await discoverConnections({ input: makeInput(), services });

    expect(result.drafts).toHaveLength(0);
    expect(result.pairs).toHaveLength(0);
    expect(result.metrics.pairsBelowThreshold).toBeGreaterThan(0);
  });

  it("handles LLM rejection (null card)", async () => {
    const summaryStore = createMockSummaryStore({
      search: vi.fn().mockResolvedValue(makeCrossDocSearchResults()),
    });
    const llm = createMockConnectionDiscoveryLlm({
      generateConnectionDraft: vi.fn().mockResolvedValue({
        card: null,
        usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      }),
    });
    const services = createMockConnectionDiscoveryServices({ summaryStore, llm });

    // Both sections (a1, a2) find section-b1 => 2 distinct candidate pairs
    const result = await discoverConnections({ input: makeInput(), services });

    expect(result.drafts).toHaveLength(0);
    expect(result.metrics.pairsRejectedByLlm).toBe(2);
    for (const pair of result.pairs) {
      expect(pair.status).toBe("failed");
    }
    expect(result.tokenUsage.totalTokens).toBe(300);
  });

  it("handles LLM error with failure isolation", async () => {
    const summaryStore = createMockSummaryStore({
      search: vi.fn().mockResolvedValue(makeCrossDocSearchResults()),
    });
    const llm = createMockConnectionDiscoveryLlm({
      generateConnectionDraft: vi.fn().mockRejectedValue(new Error("LLM crashed")),
    });
    const services = createMockConnectionDiscoveryServices({ summaryStore, llm });

    // Both sections find section-b1 => 2 candidates, both fail
    const result = await discoverConnections({ input: makeInput(), services });

    expect(result.drafts).toHaveLength(0);
    expect(result.metrics.pairsFailedLlm).toBe(2);
  });

  it("falls back to within-document when no cross-document matches", async () => {
    const withinDocResults: SummarySearchResult[] = [
      {
        id: "emb-a2",
        score: 0.82,
        payload: {
          documentId: "doc-a",
          userId: "user-1",
          summaryType: "section" as const,
          sectionTitle: "Section A2",
        },
      },
    ];

    const searchFn = vi
      .fn()
      .mockImplementation(async (_vector: number[], filter: { documentIds?: string[] }) => {
        if (filter.documentIds) {
          return withinDocResults;
        }
        return [];
      });

    const summaryStore = createMockSummaryStore({ search: searchFn });
    const services = createMockConnectionDiscoveryServices({ summaryStore });

    const result = await discoverConnections({ input: makeInput(), services });

    expect(result.metrics.withinDocumentFallback).toBe(true);
    expect(result.pairs.length).toBeGreaterThan(0);
    expect(result.pairs[0]!.connectionType).toBe("within_document");
  });

  it("returns empty when no sections provided", async () => {
    const services = createMockConnectionDiscoveryServices();

    const result = await discoverConnections({
      input: makeInput({ newDocumentSections: [] }),
      services,
    });

    expect(result.drafts).toHaveLength(0);
    expect(result.pairs).toHaveLength(0);
  });

  it("skips existing pair keys", async () => {
    const summaryStore = createMockSummaryStore({
      search: vi.fn().mockResolvedValue(makeCrossDocSearchResults()),
    });
    const services = createMockConnectionDiscoveryServices({ summaryStore });

    const existingKey = buildPairKey("section-a1", "section-b1");
    const result = await discoverConnections({
      input: makeInput({ existingPairKeys: new Set([existingKey]) }),
      services,
    });

    expect(result.metrics.pairsDeduplicatedByKey).toBeGreaterThan(0);
  });

  it("skips draft hashes already seen", async () => {
    const summaryStore = createMockSummaryStore({
      search: vi.fn().mockResolvedValue(makeCrossDocSearchResults()),
    });
    const services = createMockConnectionDiscoveryServices({ summaryStore });

    const firstResult = await discoverConnections({ input: makeInput(), services });
    expect(firstResult.drafts.length).toBeGreaterThan(0);

    const existingHashes = new Set(firstResult.drafts.map((d) => d.contentHash));
    const secondResult = await discoverConnections({
      input: makeInput({ existingDraftHashes: existingHashes }),
      services,
    });

    expect(secondResult.metrics.draftsDeduplicated).toBeGreaterThan(0);
  });

  it("accumulates token usage across all candidates", async () => {
    const usage = { inputTokens: 100, outputTokens: 50, totalTokens: 150 };
    const summaryStore = createMockSummaryStore({
      search: vi.fn().mockResolvedValue(makeCrossDocSearchResults()),
    });
    const llm = createMockConnectionDiscoveryLlm({
      generateConnectionDraft: vi.fn().mockResolvedValue({
        card: {
          content: "A meaningful connection between the two sections discussing related concepts.",
          typeData: {
            type: "connection",
            sourceATitleHint: "Doc A",
            sourceBTitleHint: "Doc B",
          },
        },
        usage,
      }),
    });
    const services = createMockConnectionDiscoveryServices({ summaryStore, llm });

    const result = await discoverConnections({ input: makeInput(), services });

    expect(result.tokenUsage.totalTokens).toBeGreaterThan(0);
  });

  it("sets pair ordering with sectionSummaryIdA < sectionSummaryIdB", async () => {
    const summaryStore = createMockSummaryStore({
      search: vi.fn().mockResolvedValue(makeCrossDocSearchResults()),
    });
    const services = createMockConnectionDiscoveryServices({ summaryStore });

    const result = await discoverConnections({ input: makeInput(), services });

    for (const pair of result.pairs) {
      expect(pair.sectionSummaryIdA < pair.sectionSummaryIdB).toBe(true);
    }
  });

  it("does not fall back to within-document when document has only one section", async () => {
    const summaryStore = createMockSummaryStore({
      search: vi.fn().mockResolvedValue([]),
    });
    const services = createMockConnectionDiscoveryServices({ summaryStore });

    const singleSection = makeInput({
      newDocumentSections: [makeSectionData()],
    });

    const result = await discoverConnections({ input: singleSection, services });

    expect(result.metrics.withinDocumentFallback).toBe(false);
    expect(result.drafts).toHaveLength(0);
  });

  it("includes similarityScore and connectionType in draft typeData", async () => {
    const summaryStore = createMockSummaryStore({
      search: vi.fn().mockResolvedValue(makeCrossDocSearchResults()),
    });
    const services = createMockConnectionDiscoveryServices({ summaryStore });

    const result = await discoverConnections({ input: makeInput(), services });

    for (const draft of result.drafts) {
      expect(draft.typeData.similarityScore).toBeGreaterThan(0);
      expect(draft.typeData.connectionType).toBe("cross_document");
    }
  });
});
