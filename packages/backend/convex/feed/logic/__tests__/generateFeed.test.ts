import { describe, expect, test } from "vitest";

import { generateFeed } from "../generateFeed";
import type { FeedInputData } from "../generateFeed";
import type { ChunkMetadata } from "../sampling";
import { createMockServices, createMockCardGenerator, createMapContentFetcher } from "./mocks";

function makeChunk(
  id: string,
  documentId: string,
  overrides?: Partial<ChunkMetadata>,
): ChunkMetadata {
  return {
    _id: id,
    documentId,
    documentTitle: `Doc ${documentId}`,
    chunkIndex: 0,
    ...overrides,
  };
}

function makeInputData(overrides?: Partial<FeedInputData>): FeedInputData {
  const chunks = [
    makeChunk("c1", "d1", { chunkIndex: 0 }),
    makeChunk("c2", "d1", { chunkIndex: 1 }),
    makeChunk("c3", "d1", { chunkIndex: 2 }),
  ];

  return {
    documents: [{ _id: "d1", title: "Test Document", createdAt: Date.now() }],
    allChunks: chunks,
    recentSources: [],
    recentPosts: [],
    recentHashes: new Set(),
    sectionSummaries: [],
    highlights: [],
    userId: "user1",
    now: Date.now(),
    ...overrides,
  };
}

const contentMap = new Map([
  ["c1", "Distributed systems require consensus algorithms to maintain consistency."],
  ["c2", "The Raft protocol provides a simpler alternative to Paxos for consensus."],
  [
    "c3",
    "CAP theorem states you can only have two of consistency, availability, partition tolerance.",
  ],
]);

describe("generateFeed", () => {
  test("happy path: returns validated cards from mock LLM", async () => {
    const services = createMockServices({
      cardGenerator: createMockCardGenerator({
        generateCards: async () => ({
          cards: [
            {
              type: "insight",
              content: "Consensus algorithms are essential for distributed systems.",
              sourceChunkIndices: [0],
            },
            {
              type: "quiz",
              content: "Test your knowledge of consensus.",
              sourceChunkIndices: [1],
              variant: "multiple_choice",
              question: "Which protocol simplifies Paxos?",
              options: ["Raft", "PBFT", "Zab", "Viewstamped"],
              correctIndex: 0,
              explanation: "Raft was designed as a more understandable consensus protocol.",
            },
            {
              type: "quote",
              content: "A fundamental theorem in distributed systems.",
              sourceChunkIndices: [2],
              quotedText:
                "You can only have two of consistency, availability, partition tolerance.",
              attribution: "Eric Brewer",
            },
          ],
          usage: { inputTokens: 500, outputTokens: 200, totalTokens: 700 },
        }),
      }),
      contentFetcher: createMapContentFetcher(contentMap),
    });

    const result = await generateFeed({
      data: makeInputData(),
      services,
      cardCount: 3,
    });

    expect(result.cards).toHaveLength(3);
    const types = result.cards.map((c) => c.card.type).sort();
    expect(types).toEqual(["insight", "quiz", "quote"]);
    // quiz is a hook type, so interleaving moves it to front
    expect(result.cards[0]!.card.type).toBe("quiz");
    expect(result.selectionMethod).toBe("weighted");
    expect(result.tokenUsage.totalTokens).toBe(700);
  });

  test("retries when validation drops more than 50% of cards", async () => {
    let callCount = 0;
    const services = createMockServices({
      cardGenerator: createMockCardGenerator({
        generateCards: async () => {
          callCount++;
          if (callCount === 1) {
            return {
              cards: [
                { type: "insight", content: "Bad card", sourceChunkIndices: [] },
                { type: "unknown_type", content: "Invalid", sourceChunkIndices: [0] },
              ],
              usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
            };
          }
          return {
            cards: [
              {
                type: "insight",
                content: "Good card on retry.",
                sourceChunkIndices: [0],
              },
            ],
            usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
          };
        },
      }),
      contentFetcher: createMapContentFetcher(contentMap),
    });

    const result = await generateFeed({
      data: makeInputData(),
      services,
      cardCount: 3,
    });

    expect(callCount).toBeGreaterThan(1);
    expect(result.cards.length).toBeGreaterThanOrEqual(1);
    expect(result.cards[0]!.card.content).toBe("Good card on retry.");
  });

  test("deduplicates cards matching recent chunk hashes", async () => {
    const services = createMockServices({
      cardGenerator: createMockCardGenerator({
        generateCards: async () => ({
          cards: [
            { type: "insight", content: "Card A", sourceChunkIndices: [0] },
            { type: "insight", content: "Card B", sourceChunkIndices: [1] },
            { type: "insight", content: "Card C", sourceChunkIndices: [2] },
          ],
          usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
        }),
      }),
      contentFetcher: createMapContentFetcher(contentMap),
    });

    // All possible single-chunk hashes to ensure at least one dedup hit
    const result = await generateFeed({
      data: makeInputData({
        recentHashes: new Set(["c1", "c2", "c3"]),
      }),
      services,
      cardCount: 3,
    });

    expect(result.cards.length).toBe(0);
    expect(result.metrics.dedupSkipped).toBe(3);
  });

  test("uses semantic selection when document summaries exist", async () => {
    const services = createMockServices({
      cardGenerator: createMockCardGenerator({
        generateCards: async () => ({
          cards: [{ type: "insight", content: "Semantic card.", sourceChunkIndices: [0] }],
          usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
        }),
      }),
      contentFetcher: createMapContentFetcher(contentMap),
    });

    const result = await generateFeed({
      data: makeInputData({
        documents: [
          {
            _id: "d1",
            title: "Test Document",
            createdAt: Date.now(),
            summary: "A document about distributed systems",
            summaryEmbeddingId: "emb-1",
          },
        ],
      }),
      services,
      cardCount: 1,
    });

    expect(result.selectionMethod).toBe("semantic");
  });

  test("continues gracefully when connection discovery throws", async () => {
    const services = createMockServices({
      cardGenerator: createMockCardGenerator({
        generateCards: async () => ({
          cards: [{ type: "insight", content: "Still works.", sourceChunkIndices: [0] }],
          usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
        }),
      }),
      contentFetcher: createMapContentFetcher(contentMap),
      vectorStore: {
        ensureCollection: async () => {},
        upsert: async () => {},
        search: async () => {
          throw new Error("Qdrant is down");
        },
        searchExcludingDocument: async () => {
          throw new Error("Qdrant is down");
        },
        delete: async () => {},
      },
    });

    const data = makeInputData({
      allChunks: [
        makeChunk("c1", "d1", { chunkIndex: 0 }),
        makeChunk("c2", "d2", { chunkIndex: 0 }),
      ],
      documents: [
        { _id: "d1", title: "Doc 1", createdAt: Date.now() },
        { _id: "d2", title: "Doc 2", createdAt: Date.now() },
      ],
    });

    const result = await generateFeed({ data, services, cardCount: 1 });

    expect(result.cards.length).toBeGreaterThanOrEqual(1);
    expect(result.metrics.connectionDiscoveryFailed).toBe(true);
  });

  test("returns empty cards when LLM produces nothing after all retries", async () => {
    const services = createMockServices({
      cardGenerator: createMockCardGenerator({
        generateCards: async () => ({
          cards: [],
          usage: { inputTokens: 100, outputTokens: 0, totalTokens: 100 },
        }),
      }),
      contentFetcher: createMapContentFetcher(contentMap),
    });

    const result = await generateFeed({
      data: makeInputData(),
      services,
      cardCount: 3,
    });

    expect(result.cards).toHaveLength(0);
  });

  test("system prompt uses generic language instruction when no document language set", async () => {
    let capturedSystemPrompt = "";
    const services = createMockServices({
      cardGenerator: createMockCardGenerator({
        generateCards: async (opts) => {
          capturedSystemPrompt = opts.systemPrompt;
          return {
            cards: [{ type: "insight", content: "Card.", sourceChunkIndices: [0] }],
            usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
          };
        },
      }),
      contentFetcher: createMapContentFetcher(contentMap),
    });

    await generateFeed({ data: makeInputData(), services, cardCount: 1 });

    expect(capturedSystemPrompt).toContain("LANGUAGE RULE");
    expect(capturedSystemPrompt).toContain("Write in the same language as the source text");
  });

  test("system prompt uses explicit language when all documents share the same language", async () => {
    let capturedSystemPrompt = "";
    let capturedLanguage: string | undefined;
    const services = createMockServices({
      cardGenerator: createMockCardGenerator({
        generateCards: async (opts) => {
          capturedSystemPrompt = opts.systemPrompt;
          capturedLanguage = opts.language;
          return {
            cards: [{ type: "insight", content: "Karta.", sourceChunkIndices: [0] }],
            usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
          };
        },
      }),
      contentFetcher: createMapContentFetcher(contentMap),
    });

    await generateFeed({
      data: makeInputData({
        documents: [{ _id: "d1", title: "Polish Doc", createdAt: Date.now(), language: "pl" }],
      }),
      services,
      cardCount: 1,
    });

    expect(capturedSystemPrompt).toContain("LANGUAGE RULE");
    expect(capturedSystemPrompt).toContain("Polish");
    expect(capturedSystemPrompt).not.toContain("same language as the source text");
    expect(capturedLanguage).toBe("pl");
  });

  test("uses dominant language when documents have mixed languages", async () => {
    let capturedLanguage: string | undefined;
    const services = createMockServices({
      cardGenerator: createMockCardGenerator({
        generateCards: async (opts) => {
          capturedLanguage = opts.language;
          return {
            cards: [{ type: "insight", content: "Card.", sourceChunkIndices: [0] }],
            usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
          };
        },
      }),
      contentFetcher: createMapContentFetcher(
        new Map([
          ["c1", "Polish content"],
          ["c2", "More Polish"],
          ["c3", "English content"],
        ]),
      ),
    });

    await generateFeed({
      data: makeInputData({
        documents: [
          { _id: "d1", title: "Polish Doc", createdAt: Date.now(), language: "pl" },
          { _id: "d2", title: "English Doc", createdAt: Date.now(), language: "en" },
        ],
        allChunks: [
          makeChunk("c1", "d1", { chunkIndex: 0 }),
          makeChunk("c2", "d1", { chunkIndex: 1 }),
          makeChunk("c3", "d2", { chunkIndex: 0 }),
        ],
      }),
      services,
      cardCount: 1,
    });

    expect(capturedLanguage).toBe("pl");
  });

  test("throws when no chunks are available", async () => {
    const services = createMockServices();

    await expect(
      generateFeed({
        data: makeInputData({ allChunks: [] }),
        services,
        cardCount: 3,
      }),
    ).rejects.toThrow("No chunks available");
  });
});
