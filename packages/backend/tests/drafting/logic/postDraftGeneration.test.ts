import { describe, expect, it, vi } from "vitest";

import {
  computeQualityScore,
  generateDraftsForSection,
  selectSectionChunks,
  selectRepresentativeChunks,
} from "../../../src/drafting/logic/postDraftGeneration";
import type {
  ChunkData,
  GenerateDraftsInput,
  SectionInput,
} from "../../../src/drafting/logic/postDraftGeneration";
import {
  createMockPostDraftLlm,
  createMockPostDraftValidator,
  createMockDraftGenerationServices,
} from "./mocks";

const fakeHash = (content: string) => `hash-${content.slice(0, 20)}`;

function makeChunk(overrides?: Partial<ChunkData>): ChunkData {
  return {
    _id: "chunk-0",
    content: "Test chunk content for generating learning cards from documents.",
    chunkIndex: 0,
    ...overrides,
  };
}

function makeSection(overrides?: Partial<SectionInput>): SectionInput {
  return {
    sectionSummaryId: "section-1",
    sectionTitle: "Introduction",
    summary: "This section introduces the main concepts.",
    chunkStartIndex: 0,
    chunkEndIndex: 2,
    ...overrides,
  };
}

function makeInput(overrides?: Partial<GenerateDraftsInput>): GenerateDraftsInput {
  return {
    documentId: "doc-1",
    userId: "user-1",
    documentTitle: "Test Document",
    section: makeSection(),
    allChunks: [
      makeChunk({ _id: "chunk-0", chunkIndex: 0 }),
      makeChunk({ _id: "chunk-1", chunkIndex: 1 }),
      makeChunk({ _id: "chunk-2", chunkIndex: 2 }),
    ],
    existingHashes: new Set(),
    hashContent: fakeHash,
    ...overrides,
  };
}

describe("selectRepresentativeChunks", () => {
  it("returns empty array when no chunks match the range", () => {
    const result = selectRepresentativeChunks({
      allChunks: [makeChunk({ chunkIndex: 10 })],
      chunkStartIndex: 0,
      chunkEndIndex: 2,
    });
    expect(result).toHaveLength(0);
  });

  it("returns all chunks when 2 or fewer match", () => {
    const chunks = [
      makeChunk({ _id: "c0", chunkIndex: 0 }),
      makeChunk({ _id: "c1", chunkIndex: 1 }),
    ];
    const result = selectRepresentativeChunks({
      allChunks: chunks,
      chunkStartIndex: 0,
      chunkEndIndex: 1,
    });
    expect(result).toHaveLength(2);
  });

  it("returns first and last for 3-4 chunks", () => {
    const chunks = [
      makeChunk({ _id: "c0", chunkIndex: 0 }),
      makeChunk({ _id: "c1", chunkIndex: 1 }),
      makeChunk({ _id: "c2", chunkIndex: 2 }),
    ];
    const result = selectRepresentativeChunks({
      allChunks: chunks,
      chunkStartIndex: 0,
      chunkEndIndex: 2,
    });
    expect(result).toHaveLength(2);
    expect(result[0]!._id).toBe("c0");
    expect(result[1]!._id).toBe("c2");
  });

  it("returns first, middle, and last for 5+ chunks", () => {
    const chunks = Array.from({ length: 7 }, (_, i) => makeChunk({ _id: `c${i}`, chunkIndex: i }));
    const result = selectRepresentativeChunks({
      allChunks: chunks,
      chunkStartIndex: 0,
      chunkEndIndex: 6,
    });
    expect(result).toHaveLength(3);
    expect(result[0]!._id).toBe("c0");
    expect(result[1]!._id).toBe("c3");
    expect(result[2]!._id).toBe("c6");
  });
});

describe("selectSectionChunks", () => {
  it("returns the full section range for deeper generation", () => {
    const chunks = Array.from({ length: 6 }, (_, i) => makeChunk({ _id: `c${i}`, chunkIndex: i }));
    const result = selectSectionChunks({
      allChunks: chunks,
      chunkStartIndex: 1,
      chunkEndIndex: 4,
    });

    expect(result.map((chunk) => chunk._id)).toEqual(["c1", "c2", "c3", "c4"]);
  });
});

describe("computeQualityScore", () => {
  it("returns 1.0 for a well-formed insight with good length", () => {
    const score = computeQualityScore({
      postType: "insight",
      content: "A".repeat(200),
      typeData: { type: "insight" },
      sourceChunkCount: 2,
    });
    expect(score).toBe(1.0);
  });

  it("returns 0.0 for content below 50 chars with single chunk", () => {
    const score = computeQualityScore({
      postType: "insight",
      content: "Short",
      typeData: { type: "insight" },
      sourceChunkCount: 1,
    });
    expect(score).toBeCloseTo(0.4 + 0.3 * 0.5);
  });

  it("gives full length score for cards in the 400-800 char range", () => {
    const score = computeQualityScore({
      postType: "insight",
      content: "A".repeat(600),
      typeData: { type: "insight" },
      sourceChunkCount: 2,
    });
    expect(score).toBe(1.0);
  });

  it("gives full length score for cards up to 1200 chars", () => {
    const score = computeQualityScore({
      postType: "insight",
      content: "A".repeat(1200),
      typeData: { type: "insight" },
      sourceChunkCount: 2,
    });
    expect(score).toBe(1.0);
  });

  it("returns 0.0 for structurally invalid quiz", () => {
    const score = computeQualityScore({
      postType: "quiz",
      content: "A".repeat(200),
      typeData: { type: "quiz" },
      sourceChunkCount: 2,
    });
    expect(score).toBeCloseTo(0.3 + 0.3);
  });

  it("gives quote type full coverage score regardless of chunk count", () => {
    const score = computeQualityScore({
      postType: "quote",
      content: "A".repeat(200),
      typeData: { type: "quote", quotedText: "some quote" },
      sourceChunkCount: 1,
    });
    expect(score).toBe(1.0);
  });
});

describe("generateDraftsForSection", () => {
  it("generates drafts for all 4 card types", async () => {
    const services = createMockDraftGenerationServices();
    const result = await generateDraftsForSection({
      input: makeInput(),
      services,
    });

    expect(result.drafts).toHaveLength(4);
    const types = result.drafts.map((d) => d.postType);
    expect(types).toContain("insight");
    expect(types).toContain("quiz");
    expect(types).toContain("quote");
    expect(types).toContain("summary");
    expect(result.metrics.draftsGenerated).toBe(4);
  });

  it("generates only the planned card types", async () => {
    const services = createMockDraftGenerationServices();
    const result = await generateDraftsForSection({
      input: makeInput({ cardTypes: ["insight", "summary"], generationBatch: 3 }),
      services,
    });

    expect(result.drafts.map((draft) => draft.postType)).toEqual(["insight", "summary"]);
    expect(result.drafts.every((draft) => draft.generationBatch === 3)).toBe(true);
    expect(result.metrics.cardTypesAttempted).toBe(2);
  });

  it("passes full section chunks to the LLM when configured for deeper context", async () => {
    const generateDraft = vi.fn().mockResolvedValue({
      card: {
        content: "Draft insight for testing: a useful learning card.",
        typeData: { type: "insight" },
      },
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        costUsd: { input: 0, output: 0, total: 0 },
      },
    });
    const llm = createMockPostDraftLlm({ generateDraft });
    const services = createMockDraftGenerationServices({ llm });

    await generateDraftsForSection({
      input: makeInput({
        cardTypes: ["insight"],
        contextDepth: "full",
        allChunks: Array.from({ length: 5 }, (_, i) =>
          makeChunk({ _id: `chunk-${i}`, chunkIndex: i }),
        ),
        section: makeSection({ chunkStartIndex: 0, chunkEndIndex: 4 }),
      }),
      services,
    });

    expect(generateDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        chunks: expect.arrayContaining([
          expect.objectContaining({ chunkId: "chunk-0" }),
          expect.objectContaining({ chunkId: "chunk-1" }),
          expect.objectContaining({ chunkId: "chunk-2" }),
          expect.objectContaining({ chunkId: "chunk-3" }),
          expect.objectContaining({ chunkId: "chunk-4" }),
        ]),
      }),
    );
  });

  it("skips quote drafts when the LLM returns no quote worth surfacing", async () => {
    const llm = createMockPostDraftLlm({
      generateDraft: vi.fn().mockResolvedValue({
        card: null,
        usage: {
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          costUsd: { input: 0, output: 0, total: 0 },
        },
      }),
    });
    const services = createMockDraftGenerationServices({ llm });

    const result = await generateDraftsForSection({
      input: makeInput({ cardTypes: ["quote"] }),
      services,
    });

    expect(result.drafts).toHaveLength(0);
    expect(result.metrics.draftsSkippedNoQuote).toBe(1);
  });

  it("returns empty drafts when no chunks match section range", async () => {
    const services = createMockDraftGenerationServices();
    const result = await generateDraftsForSection({
      input: makeInput({
        section: makeSection({ chunkStartIndex: 100, chunkEndIndex: 200 }),
      }),
      services,
    });

    expect(result.drafts).toHaveLength(0);
    expect(result.metrics.draftsGenerated).toBe(0);
  });

  it("deduplicates drafts with same content hash", async () => {
    const llm = createMockPostDraftLlm({
      generateDraft: vi.fn().mockResolvedValue({
        card: {
          content: "Identical content for all types",
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
    const services = createMockDraftGenerationServices({ llm });

    const result = await generateDraftsForSection({
      input: makeInput(),
      services,
    });

    expect(result.drafts).toHaveLength(1);
    expect(result.metrics.draftsDeduplicated).toBe(3);
  });

  it("skips drafts that already exist in existingHashes", async () => {
    const services = createMockDraftGenerationServices();
    const input = makeInput();

    const firstResult = await generateDraftsForSection({ input, services });
    const existingHashes = new Set(firstResult.drafts.map((d) => d.contentHash));

    const secondResult = await generateDraftsForSection({
      input: makeInput({ existingHashes }),
      services,
    });

    expect(secondResult.drafts).toHaveLength(0);
    expect(secondResult.metrics.draftsDeduplicated).toBe(4);
  });

  it("discards drafts below minimum quality score", async () => {
    const llm = createMockPostDraftLlm({
      generateDraft: vi.fn().mockResolvedValue({
        card: {
          content: "",
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
    const services = createMockDraftGenerationServices({ llm });

    const result = await generateDraftsForSection({
      input: makeInput(),
      services,
    });

    expect(result.drafts).toHaveLength(0);
  });

  it("accumulates token usage across all card types", async () => {
    const usage = {
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
      costUsd: { input: 0, output: 0, total: 0 },
    };
    const llm = createMockPostDraftLlm({
      generateDraft: vi
        .fn()
        .mockImplementation(
          async (opts: { postType: string; sectionTitle: string; learningGoal?: string }) => ({
            card: {
              content: `Draft ${opts.postType} for "${opts.sectionTitle}": useful learning card content here.`,
              typeData:
                opts.postType === "quiz"
                  ? {
                      type: "quiz",
                      variant: "multiple_choice",
                      question: "Test?",
                      options: ["A", "B", "C", "D"],
                      correctIndex: 0,
                      explanation: "Because A.",
                    }
                  : opts.postType === "quote"
                    ? { type: "quote", quotedText: "A notable passage." }
                    : opts.postType === "summary"
                      ? { type: "summary", bulletPoints: ["Point 1", "Point 2"] }
                      : { type: "insight" },
            },
            usage,
          }),
        ),
    });
    const services = createMockDraftGenerationServices({ llm });

    const result = await generateDraftsForSection({
      input: makeInput(),
      services,
    });

    expect(result.tokenUsage).toEqual({
      inputTokens: 400,
      outputTokens: 200,
      totalTokens: 600,
      costUsd: { input: 0, output: 0, total: 0 },
    });
  });

  it("continues generating other types when one LLM call fails", async () => {
    const llm = createMockPostDraftLlm({
      generateDraft: vi
        .fn()
        .mockImplementation(
          async (opts: { postType: string; sectionTitle: string; learningGoal?: string }) => {
            if (opts.postType === "quiz") throw new Error("LLM failure");
            return {
              card: {
                content: `Draft ${opts.postType} for "${opts.sectionTitle}": useful card content here.`,
                typeData:
                  opts.postType === "quote"
                    ? { type: "quote", quotedText: "A quote." }
                    : opts.postType === "summary"
                      ? { type: "summary", bulletPoints: ["Point 1", "Point 2"] }
                      : { type: opts.postType },
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
    const services = createMockDraftGenerationServices({ llm });

    const result = await generateDraftsForSection({
      input: makeInput(),
      services,
    });

    expect(result.drafts.length).toBe(3);
    expect(result.metrics.draftsFailedLlm).toBe(1);
  });

  it("passes fileType through to the LLM", async () => {
    const generateDraft = vi.fn().mockResolvedValue({
      card: {
        content: "Draft insight for testing: a useful learning card.",
        typeData: { type: "insight" },
      },
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        costUsd: { input: 0, output: 0, total: 0 },
      },
    });
    const llm = createMockPostDraftLlm({ generateDraft });
    const services = createMockDraftGenerationServices({ llm });

    await generateDraftsForSection({
      input: makeInput({ fileType: "youtube" }),
      services,
    });

    expect(generateDraft).toHaveBeenCalledWith(expect.objectContaining({ fileType: "youtube" }));
  });

  it("passes learningGoal through to the LLM when present", async () => {
    const generateDraft = vi.fn().mockResolvedValue({
      card: {
        content: "Draft insight for testing: a useful learning card.",
        typeData: { type: "insight" },
      },
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        costUsd: { input: 0, output: 0, total: 0 },
      },
    });
    const llm = createMockPostDraftLlm({ generateDraft });
    const services = createMockDraftGenerationServices({ llm });

    await generateDraftsForSection({
      input: makeInput({ learningGoal: "Understand layered architecture tradeoffs" }),
      services,
    });

    expect(generateDraft).toHaveBeenCalledWith(
      expect.objectContaining({ learningGoal: "Understand layered architecture tradeoffs" }),
    );
  });

  it("sets correct metadata on generated drafts", async () => {
    const services = createMockDraftGenerationServices();
    const result = await generateDraftsForSection({
      input: makeInput(),
      services,
    });

    for (const draft of result.drafts) {
      expect(draft.documentId).toBe("doc-1");
      expect(draft.userId).toBe("user-1");
      expect(draft.sectionSummaryId).toBe("section-1");
      expect(draft.strategy).toBe("section");
      expect(draft.generationBatch).toBe(1);
      expect(draft.qualityScore).toBeGreaterThanOrEqual(0.3);
      expect(draft.contentHash).toBeTruthy();
      expect(draft.sourceChunkIds.length).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("generateDraftsForSection with validator", () => {
  it("rejects drafts that fail validation", async () => {
    const validator = createMockPostDraftValidator({
      validateDraft: vi.fn().mockImplementation(async (opts: { postType: string }) => ({
        isValid: opts.postType !== "quote",
        rejectionReason: opts.postType === "quote" ? "Not a real quote" : undefined,
        usage: {
          inputTokens: 10,
          outputTokens: 5,
          totalTokens: 15,
          costUsd: { input: 0, output: 0, total: 0 },
        },
      })),
    });
    const services = createMockDraftGenerationServices({ validator });

    const result = await generateDraftsForSection({
      input: makeInput(),
      services,
    });

    expect(result.drafts).toHaveLength(3);
    expect(result.drafts.map((d) => d.postType)).not.toContain("quote");
    expect(result.metrics.draftsRejectedValidation).toBe(1);
    expect(result.metrics.validationRejections).toHaveLength(1);
    expect(result.metrics.validationRejections[0]!.postType).toBe("quote");
    expect(result.metrics.validationRejections[0]!.reason).toBe("Not a real quote");
  });

  it("rejects all drafts when validator marks everything invalid", async () => {
    const validator = createMockPostDraftValidator({
      validateDraft: vi.fn().mockResolvedValue({
        isValid: false,
        rejectionReason: "Worthless content",
        usage: {
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          costUsd: { input: 0, output: 0, total: 0 },
        },
      }),
    });
    const services = createMockDraftGenerationServices({ validator });

    const result = await generateDraftsForSection({
      input: makeInput(),
      services,
    });

    expect(result.drafts).toHaveLength(0);
    expect(result.metrics.draftsRejectedValidation).toBe(4);
    expect(result.metrics.draftsGenerated).toBe(0);
  });

  it("passes drafts through when validator is absent", async () => {
    const services = createMockDraftGenerationServices({ validator: undefined });

    const result = await generateDraftsForSection({
      input: makeInput(),
      services,
    });

    expect(result.drafts).toHaveLength(4);
    expect(result.metrics.draftsRejectedValidation).toBe(0);
    expect(result.metrics.validationRejections).toHaveLength(0);
  });

  it("fails open when validator throws and tracks errored count", async () => {
    const validator = createMockPostDraftValidator({
      validateDraft: vi.fn().mockRejectedValue(new Error("LLM timeout")),
    });
    const services = createMockDraftGenerationServices({ validator });

    const result = await generateDraftsForSection({
      input: makeInput(),
      services,
    });

    expect(result.drafts).toHaveLength(4);
    expect(result.metrics.draftsRejectedValidation).toBe(0);
    expect(result.metrics.draftsValidatorErrored).toBe(4);
  });

  it("accumulates validator token usage", async () => {
    const validatorUsage = {
      inputTokens: 20,
      outputTokens: 10,
      totalTokens: 30,
      costUsd: { input: 0, output: 0, total: 0 },
    };
    const validator = createMockPostDraftValidator({
      validateDraft: vi.fn().mockResolvedValue({
        isValid: true,
        usage: validatorUsage,
      }),
    });
    const services = createMockDraftGenerationServices({ validator });

    const result = await generateDraftsForSection({
      input: makeInput(),
      services,
    });

    expect(result.tokenUsage.totalTokens).toBeGreaterThanOrEqual(120);
  });
});
