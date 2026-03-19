import { ALL_POST_TYPES } from "../lib/validators";
import type { EmbeddingProvider, SummaryVectorStore } from "../providers/types";

import { FRESHNESS_WINDOW_MS, computeRecencyBoost } from "./constants";
import type { ChunkLike, ChunkMetadata, UsageInfo } from "./selectionLogic";
import { filterChunksBySemantic, rankByUsage } from "./selectionLogic";

export type ChunkInfo = ChunkLike;
export type { ChunkMetadata } from "./selectionLogic";
export type ChunkUsage = UsageInfo;

const SEMANTIC_TOP_DOCS = 5;
const SEMANTIC_TOP_SECTIONS = 8;

export type DocumentSummaryInfo = {
  documentId: string;
  documentTitle: string;
  summary: string;
  summaryEmbeddingId: string;
};

export type SectionSummaryInfo = {
  documentId: string;
  sectionTitle: string;
  summary: string;
  chunkStartIndex: number;
  chunkEndIndex: number;
};

export type PostSourceRecord = {
  chunkId: string;
  postId: string;
  createdAt: number;
};

export function buildChunkUsageMap(
  postSources: PostSourceRecord[],
  posts: { _id: string; postType: string }[],
): Map<string, ChunkUsage> {
  const postTypeMap = new Map(posts.map((p) => [p._id, p.postType]));
  const chunkUsageMap = new Map<string, ChunkUsage>();

  for (const src of postSources) {
    const type = postTypeMap.get(src.postId);
    if (!type) continue;
    const existing = chunkUsageMap.get(src.chunkId) ?? { types: new Set<string>(), totalCount: 0 };
    existing.types.add(type);
    existing.totalCount++;
    chunkUsageMap.set(src.chunkId, existing);
  }

  return chunkUsageMap;
}

export type WeightedSampleArgs = {
  chunks: ChunkMetadata[];
  chunkUsageMap: Map<string, ChunkUsage>;
  docCreatedAtMap: Map<string, number>;
  count: number;
  now: number;
  randomFn?: () => number;
};

export function weightedSample(args: WeightedSampleArgs): ChunkMetadata[] {
  const { chunks, chunkUsageMap, docCreatedAtMap, count, now, randomFn = Math.random } = args;
  const base = 1.0;
  const weights = chunks.map((chunk) => {
    const usage = chunkUsageMap.get(chunk._id);
    const typesUsed = usage?.types.size ?? 0;
    const totalUsage = usage?.totalCount ?? 0;
    const docCreatedAt = docCreatedAtMap.get(chunk.documentId) ?? 0;
    const recencyBoost = computeRecencyBoost(docCreatedAt, now);
    return (
      base * recencyBoost * (1 / (1 + totalUsage)) * (1 + (ALL_POST_TYPES.length - typesUsed) * 0.3)
    );
  });

  const selected: ChunkMetadata[] = [];
  const usedIndices = new Set<number>();
  const docCounts = new Map<string, number>();

  for (let pick = 0; pick < Math.min(count, chunks.length); pick++) {
    const totalWeight = weights.reduce((sum, w, i) => (usedIndices.has(i) ? sum : sum + w), 0);
    if (totalWeight <= 0) break;

    let rand = randomFn() * totalWeight;
    let chosenIdx = -1;
    for (let i = 0; i < weights.length; i++) {
      if (usedIndices.has(i)) continue;
      rand -= weights[i]!;
      if (rand <= 0) {
        chosenIdx = i;
        break;
      }
    }
    if (chosenIdx === -1) {
      for (let i = weights.length - 1; i >= 0; i--) {
        if (!usedIndices.has(i)) {
          chosenIdx = i;
          break;
        }
      }
    }
    if (chosenIdx === -1) break;

    selected.push(chunks[chosenIdx]!);
    usedIndices.add(chosenIdx);
    docCounts.set(
      chunks[chosenIdx]!.documentId,
      (docCounts.get(chunks[chosenIdx]!.documentId) ?? 0) + 1,
    );
  }

  if (selected.length >= 2 && docCounts.size < 2) {
    const chunkIndexMap = new Map(chunks.map((c, i) => [c._id, i]));
    const otherDocChunks = chunks.filter(
      (c) =>
        !usedIndices.has(chunkIndexMap.get(c._id)!) && c.documentId !== selected[0]!.documentId,
    );
    if (otherDocChunks.length > 0) {
      selected[selected.length - 1] =
        otherDocChunks[Math.floor(randomFn() * otherDocChunks.length)]!;
    }
  }

  return selected;
}

export function buildTypeCoverageHint(chunkUsageMap: Map<string, ChunkUsage>): string {
  const coverage = new Map<string, number>();
  for (const usage of chunkUsageMap.values()) {
    for (const t of usage.types) {
      coverage.set(t, (coverage.get(t) ?? 0) + 1);
    }
  }

  const underused = ALL_POST_TYPES.filter((t) => (coverage.get(t) ?? 0) < 2);
  if (underused.length === 0) return "";
  return `\n\nType coverage hint: The following types have been used least recently and should be preferred: ${underused.join(", ")}.`;
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export type SemanticSelectArgs = {
  allChunks: ChunkMetadata[];
  docSummaries: DocumentSummaryInfo[];
  chunkUsageMap: Map<string, ChunkUsage>;
  docCreatedAtMap: Map<string, number>;
  count: number;
  userId: string;
  embedder: EmbeddingProvider;
  summaryStore: SummaryVectorStore;
  now: number;
  randomFn?: () => number;
};

export async function semanticSelect(args: SemanticSelectArgs): Promise<ChunkMetadata[]> {
  const {
    allChunks,
    docSummaries,
    chunkUsageMap,
    docCreatedAtMap,
    count,
    userId,
    embedder,
    summaryStore,
    now,
    randomFn = Math.random,
  } = args;

  if (docSummaries.length === 0) {
    return frontLoadFreshChunks({
      chunks: shuffle(allChunks),
      docCreatedAtMap,
      now,
      maxFresh: count,
    }).slice(0, count);
  }

  const seedDoc = docSummaries[Math.floor(randomFn() * docSummaries.length)]!;
  const seedVectors = await embedder.embed([seedDoc.summary]);
  const seedVector = seedVectors[0]!;

  const docResults = await summaryStore.search(
    seedVector,
    { userId, summaryType: "document" },
    SEMANTIC_TOP_DOCS,
  );

  const selectedDocIds = new Set(docResults.map((r) => r.payload.documentId));
  if (selectedDocIds.size === 0) {
    selectedDocIds.add(seedDoc.documentId);
  }

  const sectionResults = await summaryStore.search(
    seedVector,
    { userId, summaryType: "section", documentIds: Array.from(selectedDocIds) },
    SEMANTIC_TOP_SECTIONS,
  );

  const selectedSections = new Set<string>();
  for (const r of sectionResults) {
    if (r.payload.sectionTitle) {
      selectedSections.add(`${r.payload.documentId}:${r.payload.sectionTitle}`);
    }
  }

  const semanticChunks = filterChunksBySemantic({ allChunks, selectedDocIds, selectedSections });

  if (semanticChunks.length === 0) {
    const docChunks = allChunks.filter((c) => selectedDocIds.has(c.documentId));
    return frontLoadFreshChunks({
      chunks: shuffle(docChunks.length > 0 ? docChunks : allChunks),
      docCreatedAtMap,
      now,
      maxFresh: count,
    }).slice(0, count);
  }

  return rankByUsage({
    chunks: semanticChunks,
    usageMap: chunkUsageMap,
    docCreatedAtMap,
    now,
    count,
    allChunksForDiversity: allChunks,
  });
}

export type FrontLoadArgs = {
  chunks: ChunkMetadata[];
  docCreatedAtMap: Map<string, number>;
  now: number;
  maxFresh?: number;
};

export function frontLoadFreshChunks(args: FrontLoadArgs): ChunkMetadata[] {
  const { chunks, docCreatedAtMap, now, maxFresh } = args;
  const fresh: ChunkMetadata[] = [];
  const rest: ChunkMetadata[] = [];

  for (const chunk of chunks) {
    const docCreatedAt = docCreatedAtMap.get(chunk.documentId) ?? 0;
    const age = now - docCreatedAt;
    if (age < FRESHNESS_WINDOW_MS) {
      fresh.push(chunk);
    } else {
      rest.push(chunk);
    }
  }

  const cap = maxFresh !== undefined ? Math.floor(maxFresh / 2) : fresh.length;
  return [...fresh.slice(0, cap), ...rest, ...fresh.slice(cap)];
}
