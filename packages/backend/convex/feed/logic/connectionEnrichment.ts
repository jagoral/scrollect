import type { ConnectionPair } from "./discovery";
import type { ChunkMetadata } from "./sampling";
import type { RawCard } from "./validation";

export type MergeResult = {
  merged: ChunkMetadata[];
  connectionHints: string[];
};

export type MergeConnectionChunksArgs = {
  selected: ChunkMetadata[];
  connectionPairs: ConnectionPair[];
};

export function mergeConnectionChunks(args: MergeConnectionChunksArgs): MergeResult {
  const { selected, connectionPairs } = args;
  if (connectionPairs.length === 0) {
    return { merged: selected, connectionHints: [] };
  }

  const selectedIds = new Set(selected.map((c) => c._id));
  const merged = [...selected];
  const connectionHints: string[] = [];

  for (const pair of connectionPairs) {
    let indexA: number;
    let indexB: number;

    if (!selectedIds.has(pair.chunkA._id)) {
      indexA = merged.length;
      merged.push(pair.chunkA);
      selectedIds.add(pair.chunkA._id);
    } else {
      indexA = merged.findIndex((c) => c._id === pair.chunkA._id);
    }

    if (!selectedIds.has(pair.chunkB._id)) {
      indexB = merged.length;
      merged.push(pair.chunkB);
      selectedIds.add(pair.chunkB._id);
    } else {
      indexB = merged.findIndex((c) => c._id === pair.chunkB._id);
    }

    const typeLabel =
      pair.connectionType === "cross_document"
        ? "cross-document"
        : "within-document (different sections)";
    connectionHints.push(
      `- Chunks ${indexA} ("${pair.chunkA.documentTitle}") and ${indexB} ("${pair.chunkB.documentTitle}") ` +
        `have high semantic similarity (${pair.similarityScore.toFixed(2)}), ${typeLabel}. ` +
        `Consider creating a connection card with sourceChunkIndices [${indexA}, ${indexB}].`,
    );
  }

  return { merged, connectionHints };
}

export type ConnectionPairMapEntry = {
  similarityScore: number;
  connectionType: "cross_document" | "within_document";
};

export function buildConnectionPairMap(
  pairs: ConnectionPair[],
  allChunks: ChunkMetadata[],
): Map<string, ConnectionPairMapEntry> {
  const chunkIdToIndex = new Map(allChunks.map((c, i) => [c._id, i]));
  const map = new Map<string, ConnectionPairMapEntry>();

  for (const pair of pairs) {
    const idxA = chunkIdToIndex.get(pair.chunkA._id);
    const idxB = chunkIdToIndex.get(pair.chunkB._id);
    if (idxA === undefined || idxB === undefined) continue;

    const key = [idxA, idxB].sort().join(":");
    map.set(key, {
      similarityScore: pair.similarityScore,
      connectionType: pair.connectionType,
    });
  }

  return map;
}

export type EnrichConnectionCardArgs = {
  card: RawCard;
  cardChunks: ChunkMetadata[];
  connectionPairMap: Map<string, ConnectionPairMapEntry>;
};

export function enrichConnectionCard(args: EnrichConnectionCardArgs): void {
  const { card, cardChunks, connectionPairMap } = args;

  for (const [key, entry] of connectionPairMap) {
    const [idxA, idxB] = key.split(":").map(Number);
    if (card.sourceChunkIndices.includes(idxA!) && card.sourceChunkIndices.includes(idxB!)) {
      card.similarityScore = entry.similarityScore;
      card.connectionType = entry.connectionType;
      return;
    }
  }

  const docIds = new Set(cardChunks.map((c) => c.documentId));
  card.connectionType = docIds.size >= 2 ? "cross_document" : "within_document";
  card.similarityScore = 0;
}
