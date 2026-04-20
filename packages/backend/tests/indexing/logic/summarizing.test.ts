import { describe, expect, it, vi } from "vitest";

import { summarizeDocumentLogic } from "../../../src/indexing/logic/summarizing";
import { createMockSummarizingServices, createMockEmbedder, createMockSummaryStore } from "./mocks";

function makeChunk(
  overrides?: Partial<{ content: string; chunkIndex: number; sectionTitle: string }>,
) {
  return {
    content: "test content",
    chunkIndex: 0,
    sectionTitle: "Section 1",
    ...overrides,
  };
}

const fakeIdToUuid = (seed: string) => `uuid-${seed}`;

describe("summarizeDocumentLogic", () => {
  it("generates section and document summaries, embeds, and upserts vectors", async () => {
    const deleteFn = vi.fn();
    const upsertFn = vi.fn();
    const services = createMockSummarizingServices({
      embedder: createMockEmbedder({
        dimensions: 2,
        lastUsage: { tokens: 42 },
        embed: vi.fn().mockResolvedValue([
          [0.1, 0.2],
          [0.3, 0.4],
        ]),
      }),
      summaryStore: createMockSummaryStore({ upsert: upsertFn, delete: deleteFn }),
    });

    const result = await summarizeDocumentLogic({
      input: {
        documentId: "doc1",
        userId: "user1",
        documentTitle: "Test Doc",
        chunks: [
          makeChunk({ chunkIndex: 0, sectionTitle: "Intro" }),
          makeChunk({ chunkIndex: 1, sectionTitle: "Intro" }),
        ],
        staleVectorIds: ["old-vec-1"],
        idToUuid: fakeIdToUuid,
      },
      services,
    });

    expect(result).not.toBeNull();
    expect(result!.docSummary).toBe("Document-level summary");
    expect(result!.docEmbeddingId).toBe(fakeIdToUuid("summary:doc:doc1"));
    expect(result!.sectionDbRecords).toHaveLength(1);
    expect(result!.sectionDbRecords[0]!.sectionTitle).toBe("Intro");
    expect(result!.sectionDbRecords[0]!.isSubstantiveContent).toBe(true);
    expect(result!.embeddingUsage).toEqual({ tokens: 42 });

    expect(result!.metrics.sectionGroups).toBe(1);
    expect(result!.metrics.sectionSummariesGenerated).toBe(1);
    expect(result!.metrics.docSummaryLength).toBeGreaterThan(0);
    expect(result!.metrics.staleVectorsDeleted).toBe(1);
    expect(result!.metrics.vectorsUpserted).toBe(2);

    expect(deleteFn).toHaveBeenCalledWith(["old-vec-1"]);
    expect(upsertFn).toHaveBeenCalledTimes(1);
  });

  it("returns null when chunks produce no valid section summaries", async () => {
    const docSummaryFn = vi.fn();
    const services = createMockSummarizingServices({
      llm: {
        generateSectionSummary: vi.fn().mockResolvedValue({
          summary: "",
          isSubstantiveContent: true,
          usage: {
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            costUsd: { input: 0, output: 0, total: 0 },
          },
        }),
        generateDocumentSummary: docSummaryFn,
      },
    });

    const result = await summarizeDocumentLogic({
      input: {
        documentId: "doc1",
        userId: "user1",
        documentTitle: "Test Doc",
        chunks: [makeChunk()],
        staleVectorIds: [],
        idToUuid: fakeIdToUuid,
      },
      services,
    });

    expect(result).toBeNull();
    expect(docSummaryFn).not.toHaveBeenCalled();
  });

  it("returns null when chunks array is empty", async () => {
    const services = createMockSummarizingServices();

    const result = await summarizeDocumentLogic({
      input: {
        documentId: "doc1",
        userId: "user1",
        documentTitle: "Test Doc",
        chunks: [],
        staleVectorIds: [],
        idToUuid: fakeIdToUuid,
      },
      services,
    });

    expect(result).toBeNull();
  });

  it("accumulates LLM token usage across all summary calls", async () => {
    const usage = {
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
      costUsd: { input: 0, output: 0, total: 0 },
    };
    const services = createMockSummarizingServices({
      llm: {
        generateSectionSummary: vi
          .fn()
          .mockResolvedValue({ summary: "section summary", isSubstantiveContent: true, usage }),
        generateDocumentSummary: vi.fn().mockResolvedValue({ summary: "doc summary", usage }),
      },
      embedder: {
        dimensions: 2,
        embed: vi.fn().mockResolvedValue([
          [0.1, 0.2],
          [0.3, 0.4],
          [0.5, 0.6],
        ]),
      },
    });

    const result = await summarizeDocumentLogic({
      input: {
        documentId: "doc1",
        userId: "user1",
        documentTitle: "Test Doc",
        chunks: [
          makeChunk({ chunkIndex: 0, sectionTitle: "A" }),
          makeChunk({ chunkIndex: 1, sectionTitle: "B" }),
        ],
        staleVectorIds: [],
        idToUuid: fakeIdToUuid,
      },
      services,
    });

    expect(result).not.toBeNull();
    expect(result!.llmTokenUsage).toEqual({
      inputTokens: 30,
      outputTokens: 15,
      totalTokens: 45,
      costUsd: { input: 0, output: 0, total: 0 },
    });
  });

  it("skips stale vector deletion when staleVectorIds is empty", async () => {
    const deleteFn = vi.fn();
    const services = createMockSummarizingServices({
      embedder: createMockEmbedder({
        dimensions: 2,
        embed: vi.fn().mockResolvedValue([
          [0.1, 0.2],
          [0.3, 0.4],
        ]),
      }),
      summaryStore: createMockSummaryStore({ delete: deleteFn }),
    });

    await summarizeDocumentLogic({
      input: {
        documentId: "doc1",
        userId: "user1",
        documentTitle: "Test Doc",
        chunks: [makeChunk()],
        staleVectorIds: [],
        idToUuid: fakeIdToUuid,
      },
      services,
    });

    expect(deleteFn).not.toHaveBeenCalled();
  });

  it("forwards language to section and document summary LLM calls", async () => {
    const sectionFn = vi.fn().mockResolvedValue({
      summary: "section summary",
      isSubstantiveContent: true,
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        costUsd: { input: 0, output: 0, total: 0 },
      },
    });
    const docFn = vi.fn().mockResolvedValue({
      summary: "doc summary",
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        costUsd: { input: 0, output: 0, total: 0 },
      },
    });
    const services = createMockSummarizingServices({
      llm: { generateSectionSummary: sectionFn, generateDocumentSummary: docFn },
      embedder: createMockEmbedder({
        dimensions: 2,
        embed: vi.fn().mockResolvedValue([
          [0.1, 0.2],
          [0.3, 0.4],
        ]),
      }),
    });

    await summarizeDocumentLogic({
      input: {
        documentId: "doc1",
        userId: "user1",
        documentTitle: "Test Doc",
        language: "pl",
        chunks: [makeChunk({ chunkIndex: 0, sectionTitle: "Intro" })],
        staleVectorIds: [],
        idToUuid: fakeIdToUuid,
      },
      services,
    });

    expect(sectionFn).toHaveBeenCalledWith(expect.objectContaining({ language: "pl" }));
    expect(docFn).toHaveBeenCalledWith(expect.objectContaining({ language: "pl" }));
  });

  it("threads isSubstantiveContent from LLM through to sectionDbRecords", async () => {
    const sectionFn = vi
      .fn()
      .mockResolvedValueOnce({
        summary: "chapter content",
        isSubstantiveContent: true,
        usage: {
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          costUsd: { input: 0, output: 0, total: 0 },
        },
      })
      .mockResolvedValueOnce({
        summary: "bibliography listing",
        isSubstantiveContent: false,
        usage: {
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          costUsd: { input: 0, output: 0, total: 0 },
        },
      });

    const docFn = vi.fn().mockResolvedValue({
      summary: "doc summary",
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        costUsd: { input: 0, output: 0, total: 0 },
      },
    });

    const services = createMockSummarizingServices({
      llm: {
        generateSectionSummary: sectionFn,
        generateDocumentSummary: docFn,
      },
      embedder: createMockEmbedder({
        dimensions: 2,
        embed: vi.fn().mockResolvedValue([
          [0.1, 0.2],
          [0.3, 0.4],
          [0.5, 0.6],
        ]),
      }),
    });

    const result = await summarizeDocumentLogic({
      input: {
        documentId: "doc1",
        userId: "user1",
        documentTitle: "Test Doc",
        chunks: [
          makeChunk({ chunkIndex: 0, sectionTitle: "Chapter 1" }),
          makeChunk({ chunkIndex: 1, sectionTitle: "Bibliography" }),
        ],
        staleVectorIds: [],
        idToUuid: fakeIdToUuid,
      },
      services,
    });

    expect(result).not.toBeNull();
    expect(result!.sectionDbRecords).toHaveLength(2);

    const chapter = result!.sectionDbRecords.find((r) => r.sectionTitle === "Chapter 1");
    const biblio = result!.sectionDbRecords.find((r) => r.sectionTitle === "Bibliography");
    expect(chapter!.isSubstantiveContent).toBe(true);
    expect(biblio!.isSubstantiveContent).toBe(false);

    // Noise sections are excluded from document summary input
    const docSummaryCall = docFn.mock.calls[0]![0];
    expect(docSummaryCall.sectionSummaries).toHaveLength(1);
    expect(docSummaryCall.sectionSummaries[0].sectionTitle).toBe("Chapter 1");
  });
});
