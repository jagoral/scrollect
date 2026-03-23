import type { HighlightLike } from "./generateFeed";
import type { ChunkMetadata } from "./selectionLogic";
import { MIN_HIGHLIGHT_MATCH_LENGTH } from "./constants";

type ChunkContent = { id: string; content: string };

export type MatchHighlightsArgs = {
  highlights: HighlightLike[];
  allChunks: ChunkMetadata[];
  chunkContents: ChunkContent[];
};

export function matchHighlightsToChunks(args: MatchHighlightsArgs): Set<string> | undefined {
  const { highlights, allChunks, chunkContents } = args;

  const normalizedHighlights = highlights
    .map((h) => ({ ...h, normalizedText: h.text.toLowerCase() }))
    .filter((h) => h.normalizedText.length >= MIN_HIGHLIGHT_MATCH_LENGTH);

  if (normalizedHighlights.length === 0) return undefined;

  const highlightedDocIds = new Set(highlights.map((h) => h.documentId));

  const candidateChunkIds = allChunks
    .filter((c) => highlightedDocIds.has(c.documentId))
    .map((c) => c._id);

  if (candidateChunkIds.length === 0) return undefined;

  const contentById = new Map(chunkContents.map((c) => [c.id, c.content]));

  const matchedIds = candidateChunkIds.filter((id) => {
    const content = contentById.get(id);
    if (!content) return false;
    const normalized = content.toLowerCase();
    return normalizedHighlights.some((h) => normalized.includes(h.normalizedText));
  });

  return matchedIds.length > 0 ? new Set(matchedIds) : undefined;
}
