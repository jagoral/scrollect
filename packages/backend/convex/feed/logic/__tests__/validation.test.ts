import { describe, expect, test } from "vitest";

import type { RawCard } from "../validation";
import { validateCard } from "../validation";
import type { ChunkLike } from "../selectionLogic";

function makeChunk(id: string, documentId: string): ChunkLike {
  return {
    _id: id,
    content: `Content for ${id}`,
    documentId,
    documentTitle: `Doc ${documentId}`,
  };
}

const twoDocChunks: ChunkLike[] = [
  makeChunk("c1", "d1"),
  makeChunk("c2", "d1"),
  makeChunk("c3", "d2"),
  makeChunk("c4", "d2"),
];

const singleDocChunks: ChunkLike[] = [
  makeChunk("c1", "d1"),
  makeChunk("c2", "d1"),
  makeChunk("c3", "d1"),
  makeChunk("c4", "d1"),
];

describe("validateCard", () => {
  describe("common validation", () => {
    test("rejects card without type", () => {
      const card = {
        type: undefined as unknown as "insight",
        content: "test",
        sourceChunkIndices: [0],
      };
      expect(validateCard({ card, chunks: twoDocChunks, documentCount: 2 })).toBe(false);
    });

    test("rejects card without content", () => {
      const card: RawCard = {
        type: "insight",
        content: "",
        sourceChunkIndices: [0],
      };
      expect(validateCard({ card, chunks: twoDocChunks, documentCount: 2 })).toBe(false);
    });

    test("rejects card with empty sourceChunkIndices", () => {
      const card: RawCard = {
        type: "insight",
        content: "test",
        sourceChunkIndices: [],
      };
      expect(validateCard({ card, chunks: twoDocChunks, documentCount: 2 })).toBe(false);
    });

    test("rejects card with out-of-bounds index", () => {
      const card: RawCard = {
        type: "insight",
        content: "test",
        sourceChunkIndices: [99],
      };
      expect(validateCard({ card, chunks: twoDocChunks, documentCount: 2 })).toBe(false);
    });

    test("accepts valid insight card", () => {
      const card: RawCard = {
        type: "insight",
        content: "Key takeaway",
        sourceChunkIndices: [0],
      };
      expect(validateCard({ card, chunks: twoDocChunks, documentCount: 2 })).toBe(true);
    });
  });

  describe("connection card validation", () => {
    test("accepts cross-document connection", () => {
      const card: RawCard = {
        type: "connection",
        content: "These concepts are related",
        sourceChunkIndices: [0, 2], // d1 and d2
        sourceATitleHint: "Doc 1 Topic",
        sourceBTitleHint: "Doc 2 Topic",
      };
      expect(validateCard({ card, chunks: twoDocChunks, documentCount: 2 })).toBe(true);
    });

    test("accepts within-document connection for single-doc user", () => {
      const card: RawCard = {
        type: "connection",
        content: "Chapter 1 connects to Chapter 3",
        sourceChunkIndices: [0, 2], // Same doc, different chunks
        sourceATitleHint: "Intro Topic",
        sourceBTitleHint: "Conclusion Topic",
      };
      expect(validateCard({ card, chunks: singleDocChunks, documentCount: 1 })).toBe(true);
    });

    test("rejects within-document connection for multi-doc user", () => {
      const card: RawCard = {
        type: "connection",
        content: "Same doc connection in multi-doc context",
        sourceChunkIndices: [0, 1], // Both from d1
        sourceATitleHint: "Topic A",
        sourceBTitleHint: "Topic B",
      };
      expect(validateCard({ card, chunks: twoDocChunks, documentCount: 2 })).toBe(false);
    });

    test("rejects connection with only one chunk index", () => {
      const card: RawCard = {
        type: "connection",
        content: "Needs two chunks",
        sourceChunkIndices: [0],
        sourceATitleHint: "Topic A",
        sourceBTitleHint: "Topic B",
      };
      expect(validateCard({ card, chunks: twoDocChunks, documentCount: 2 })).toBe(false);
    });

    test("rejects connection with same chunk referenced twice", () => {
      const card: RawCard = {
        type: "connection",
        content: "Same chunk twice",
        sourceChunkIndices: [0, 0],
        sourceATitleHint: "Topic A",
        sourceBTitleHint: "Topic B",
      };
      expect(validateCard({ card, chunks: singleDocChunks, documentCount: 1 })).toBe(false);
    });

    test("rejects connection without sourceATitleHint", () => {
      const card: RawCard = {
        type: "connection",
        content: "Missing title A",
        sourceChunkIndices: [0, 2],
        sourceBTitleHint: "Topic B",
      };
      expect(validateCard({ card, chunks: twoDocChunks, documentCount: 2 })).toBe(false);
    });

    test("rejects connection without sourceBTitleHint", () => {
      const card: RawCard = {
        type: "connection",
        content: "Missing title B",
        sourceChunkIndices: [0, 2],
        sourceATitleHint: "Topic A",
      };
      expect(validateCard({ card, chunks: twoDocChunks, documentCount: 2 })).toBe(false);
    });
  });

  describe("quiz card validation", () => {
    test("accepts valid quiz", () => {
      const card: RawCard = {
        type: "quiz",
        content: "Test your knowledge",
        sourceChunkIndices: [0],
        question: "What is X?",
        variant: "multiple_choice",
        options: ["A", "B", "C", "D"],
        correctIndex: 0,
        explanation: "Because A is correct",
      };
      expect(validateCard({ card, chunks: twoDocChunks, documentCount: 2 })).toBe(true);
    });

    test("rejects quiz without question", () => {
      const card: RawCard = {
        type: "quiz",
        content: "Test",
        sourceChunkIndices: [0],
        options: ["A", "B"],
        correctIndex: 0,
        explanation: "Reason",
      };
      expect(validateCard({ card, chunks: twoDocChunks, documentCount: 2 })).toBe(false);
    });
  });

  describe("summary card validation", () => {
    test("accepts valid summary with multiple chunk indices", () => {
      const card: RawCard = {
        type: "summary",
        content: "Summary of multiple chunks",
        sourceChunkIndices: [0, 1],
        bulletPoints: ["Point 1", "Point 2"],
      };
      expect(validateCard({ card, chunks: twoDocChunks, documentCount: 2 })).toBe(true);
    });

    test("rejects summary with only one chunk index", () => {
      const card: RawCard = {
        type: "summary",
        content: "Summary",
        sourceChunkIndices: [0],
        bulletPoints: ["Point 1", "Point 2"],
      };
      expect(validateCard({ card, chunks: twoDocChunks, documentCount: 2 })).toBe(false);
    });
  });

  describe("quote card validation", () => {
    test("accepts valid quote", () => {
      const card: RawCard = {
        type: "quote",
        content: "Notable quote from the source",
        sourceChunkIndices: [0],
        quotedText: "The actual quoted text",
      };
      expect(validateCard({ card, chunks: twoDocChunks, documentCount: 2 })).toBe(true);
    });

    test("rejects quote without quotedText", () => {
      const card: RawCard = {
        type: "quote",
        content: "Quote card",
        sourceChunkIndices: [0],
      };
      expect(validateCard({ card, chunks: twoDocChunks, documentCount: 2 })).toBe(false);
    });
  });
});
