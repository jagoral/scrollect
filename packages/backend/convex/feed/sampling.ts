import { ALL_POST_TYPES } from "../lib/validators";
import type { EmbeddingProvider, SummaryVectorStore } from "../providers/types";

import { filterChunksBySemantic, rankByUsage } from "./selectionLogic";

const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

const SEMANTIC_TOP_DOCS = 5;
const SEMANTIC_TOP_SECTIONS = 8;

export type ChunkInfo = {
  _id: string;
  content: string;
  documentId: string;
  documentTitle: string;
  sectionTitle?: string;
  pageNumber?: number;
};

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

export type ChunkUsage = {
  types: Set<string>;
  totalCount: number;
};

export type PostSourceRecord = {
  chunkId: string;
  postId: string;
  createdAt: number;
};

export function computeRecencyBoost(docCreatedAt: number, now: number): number {
  const age = now - docCreatedAt;
  if (age < FORTY_EIGHT_HOURS_MS) return 2.0;
  if (age < SEVEN_DAYS_MS) {
    return 1.0 + (1.0 * (SEVEN_DAYS_MS - age)) / (SEVEN_DAYS_MS - FORTY_EIGHT_HOURS_MS);
  }
  return 1.0;
}

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
  chunks: ChunkInfo[];
  chunkUsageMap: Map<string, ChunkUsage>;
  docCreatedAtMap: Map<string, number>;
  count: number;
  now: number;
};

export function weightedSample(args: WeightedSampleArgs): ChunkInfo[] {
  const { chunks, chunkUsageMap, docCreatedAtMap, count, now } = args;
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

  const selected: ChunkInfo[] = [];
  const usedIndices = new Set<number>();
  const docCounts = new Map<string, number>();

  for (let pick = 0; pick < Math.min(count, chunks.length); pick++) {
    const totalWeight = weights.reduce((sum, w, i) => (usedIndices.has(i) ? sum : sum + w), 0);
    if (totalWeight <= 0) break;

    let rand = Math.random() * totalWeight;
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
        otherDocChunks[Math.floor(Math.random() * otherDocChunks.length)]!;
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
  allChunks: ChunkInfo[];
  docSummaries: DocumentSummaryInfo[];
  sectionSummaries: SectionSummaryInfo[];
  chunkUsageMap: Map<string, ChunkUsage>;
  count: number;
  userId: string;
  embedder: EmbeddingProvider;
  summaryStore: SummaryVectorStore;
};

export async function semanticSelect(args: SemanticSelectArgs): Promise<ChunkInfo[]> {
  const { allChunks, docSummaries, chunkUsageMap, count, userId, embedder, summaryStore } = args;

  if (docSummaries.length === 0) {
    return shuffle(allChunks).slice(0, count);
  }

  const seedDoc = docSummaries[Math.floor(Math.random() * docSummaries.length)]!;
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
    return shuffle(docChunks.length > 0 ? docChunks : allChunks).slice(0, count);
  }

  return rankByUsage({
    chunks: semanticChunks,
    usageMap: chunkUsageMap,
    count,
    allChunksForDiversity: allChunks,
  });
}
