import type { SummaryVectorPoint } from "../providers/types";

export type ChunkGroup<T> = {
  sectionTitle: string;
  chunks: T[];
};

export function groupChunksBySection<T extends { chunkIndex: number; sectionTitle?: string }>(
  chunks: T[],
): ChunkGroup<T>[] {
  const groups = new Map<string, ChunkGroup<T>>();

  for (const chunk of chunks) {
    const title = chunk.sectionTitle ?? "(ungrouped)";
    const existing = groups.get(title);
    if (existing) {
      existing.chunks.push(chunk);
    } else {
      groups.set(title, {
        sectionTitle: title,
        chunks: [chunk],
      });
    }
  }

  return Array.from(groups.values());
}

export function truncateSectionText(chunks: Array<{ content: string }>, maxChars: number): string {
  const parts: string[] = [];
  let length = 0;

  for (const chunk of chunks) {
    const addition = chunk.content.length + (parts.length > 0 ? 2 : 0);
    if (length + addition > maxChars && parts.length > 0) break;
    parts.push(chunk.content);
    length += addition;
  }

  return parts.join("\n\n");
}

export type SectionResult = {
  sectionTitle: string;
  summary: string;
  chunkStartIndex: number;
  chunkEndIndex: number;
};

export type SummaryPointsInput = {
  documentId: string;
  userId: string;
  docSummary: string;
  sectionResults: SectionResult[];
  vectors: number[][];
  idToUuid: (seed: string) => string;
};

export type SummaryVectorPointOutput = SummaryVectorPoint;

export type SectionDbRecord = {
  sectionTitle: string;
  summary: string;
  embeddingId: string;
  chunkStartIndex: number;
  chunkEndIndex: number;
};

export function buildSummaryVectorPoints(input: SummaryPointsInput): {
  docPoint: SummaryVectorPointOutput;
  docEmbeddingId: string;
  sectionPoints: SummaryVectorPointOutput[];
  sectionDbRecords: SectionDbRecord[];
} {
  const { documentId, userId, sectionResults, vectors, idToUuid } = input;

  const expectedVectors = 1 + sectionResults.length;
  if (vectors.length !== expectedVectors) {
    throw new Error(`Expected ${expectedVectors} vectors, got ${vectors.length}`);
  }

  const docEmbeddingId = idToUuid(`summary:doc:${documentId}`);
  const docPoint: SummaryVectorPointOutput = {
    id: docEmbeddingId,
    vector: vectors[0]!,
    payload: { documentId, userId, summaryType: "document" },
  };

  const sectionPoints: SummaryVectorPointOutput[] = [];
  const sectionDbRecords: SectionDbRecord[] = [];

  for (let i = 0; i < sectionResults.length; i++) {
    const section = sectionResults[i]!;
    const embeddingId = idToUuid(`summary:section:${documentId}:${section.sectionTitle}`);
    sectionPoints.push({
      id: embeddingId,
      vector: vectors[i + 1]!,
      payload: { documentId, userId, summaryType: "section", sectionTitle: section.sectionTitle },
    });
    sectionDbRecords.push({
      sectionTitle: section.sectionTitle,
      summary: section.summary,
      embeddingId,
      chunkStartIndex: section.chunkStartIndex,
      chunkEndIndex: section.chunkEndIndex,
    });
  }

  return { docPoint, docEmbeddingId, sectionPoints, sectionDbRecords };
}
