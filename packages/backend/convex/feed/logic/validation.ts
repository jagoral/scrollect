import type { ChunkMetadata } from "./sampling";

export type RawCard = {
  type: "insight" | "quiz" | "quote" | "summary" | "connection";
  content: string;
  sourceChunkIndices: number[];
  question?: string;
  options?: string[];
  correctIndex?: number;
  explanation?: string;
  variant?: "multiple_choice" | "true_false";
  quotedText?: string;
  attribution?: string;
  bulletPoints?: string[];
  sourceATitleHint?: string;
  sourceBTitleHint?: string;
  sourceAKeyIdea?: string;
  sourceBKeyIdea?: string;
  similarityScore?: number;
  connectionType?: "cross_document" | "within_document";
};

export type ValidateCardParams = {
  card: RawCard;
  chunks: ChunkMetadata[];
  documentCount: number;
};

export function validateCard(params: ValidateCardParams): boolean {
  const { card, chunks, documentCount } = params;

  if (!card.type || !card.content || !Array.isArray(card.sourceChunkIndices)) {
    return false;
  }

  if (card.sourceChunkIndices.some((i) => i < 0 || i >= chunks.length)) {
    return false;
  }

  if (card.sourceChunkIndices.length === 0) {
    return false;
  }

  switch (card.type) {
    case "quiz": {
      if (!card.question || !Array.isArray(card.options) || card.options.length < 2) return false;
      if (
        card.correctIndex === undefined ||
        card.correctIndex < 0 ||
        card.correctIndex >= card.options.length
      )
        return false;
      if (!card.explanation) return false;
      const questionLower = card.question.toLowerCase();
      if (card.options.some((opt) => questionLower.includes(opt.toLowerCase()) && opt.length > 3))
        return false;
      return true;
    }
    case "quote":
      return !!card.quotedText;
    case "summary": {
      if (!Array.isArray(card.bulletPoints) || card.bulletPoints.length < 2) return false;
      if (card.sourceChunkIndices.length < 2) return false;
      return true;
    }
    case "connection": {
      if (!card.sourceATitleHint || !card.sourceBTitleHint) return false;
      if (card.sourceChunkIndices.length < 2) return false;
      const docIds = new Set(card.sourceChunkIndices.map((i) => chunks[i]!.documentId));
      if (docIds.size >= 2) return true;
      if (documentCount === 1) {
        const chunkIds = new Set(card.sourceChunkIndices.map((i) => chunks[i]!._id));
        if (chunkIds.size >= 2) return true;
      }
      return false;
    }
    case "insight":
      return true;
    default:
      return false;
  }
}
