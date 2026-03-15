export type ChunkLike = {
  _id: string;
  content: string;
  documentId: string;
  documentTitle: string;
  sectionTitle?: string;
  pageNumber?: number;
};

export type FilterArgs = {
  allChunks: ChunkLike[];
  selectedDocIds: Set<string>;
  selectedSections: Set<string>;
};

export function filterChunksBySemantic(args: FilterArgs): ChunkLike[] {
  const { allChunks, selectedDocIds, selectedSections } = args;
  const result: ChunkLike[] = [];

  for (const chunk of allChunks) {
    if (!selectedDocIds.has(chunk.documentId)) continue;

    if (selectedSections.size > 0) {
      const sectionKey = `${chunk.documentId}:${chunk.sectionTitle ?? "(ungrouped)"}`;
      if (selectedSections.has(sectionKey)) {
        result.push(chunk);
      }
    } else {
      result.push(chunk);
    }
  }

  return result;
}

export type UsageInfo = {
  types: Set<string>;
  totalCount: number;
};

export type RankArgs = {
  chunks: ChunkLike[];
  usageMap: Map<string, UsageInfo>;
  count: number;
  allChunksForDiversity?: ChunkLike[];
  randomFn?: () => number;
};

export function rankByUsage(args: RankArgs): ChunkLike[] {
  const { chunks, usageMap, count, allChunksForDiversity, randomFn = Math.random } = args;

  const weighted = chunks.map((chunk) => {
    const usage = usageMap.get(chunk._id);
    const totalUsage = usage?.totalCount ?? 0;
    return { chunk, weight: 1 / (1 + totalUsage) };
  });

  weighted.sort((a, b) => b.weight - a.weight);

  const result: ChunkLike[] = [];
  const seen = new Set<string>();
  const docCounts = new Map<string, number>();

  for (const { chunk } of weighted) {
    if (result.length >= count) break;
    if (seen.has(chunk._id)) continue;
    seen.add(chunk._id);
    result.push(chunk);
    docCounts.set(chunk.documentId, (docCounts.get(chunk.documentId) ?? 0) + 1);
  }

  if (result.length >= 2 && docCounts.size < 2) {
    const pool = allChunksForDiversity ?? chunks;
    const otherDocChunks = pool.filter(
      (c) => !seen.has(c._id) && c.documentId !== result[0]!.documentId,
    );
    if (otherDocChunks.length > 0) {
      result[result.length - 1] = otherDocChunks[Math.floor(randomFn() * otherDocChunks.length)]!;
    }
  }

  return result;
}

export type DocSummaryLike = {
  documentId: string;
  documentTitle: string;
  summary: string;
};

export type SectionSummaryLike = {
  documentId: string;
  sectionTitle: string;
  summary: string;
};

export type SummaryContextArgs = {
  docSummaries: DocSummaryLike[];
  sectionSummaries: SectionSummaryLike[];
  selectedDocIds: Set<string>;
};

export function buildSummaryContext(args: SummaryContextArgs): string {
  const { docSummaries, sectionSummaries, selectedDocIds } = args;

  const relevantDocs = docSummaries.filter((d) => selectedDocIds.has(d.documentId));
  if (relevantDocs.length === 0) return "";

  const docCtx = relevantDocs.map((d) => `"${d.documentTitle}": ${d.summary}`).join("\n");

  const relevantSections = sectionSummaries.filter((s) => selectedDocIds.has(s.documentId));
  const sectionCtx = relevantSections.map((s) => `  "${s.sectionTitle}": ${s.summary}`).join("\n");

  return `\n\nDocument context:\n${docCtx}${sectionCtx ? `\n\nSection context:\n${sectionCtx}` : ""}\n\n`;
}
