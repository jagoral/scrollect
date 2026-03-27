import { ZERO_USAGE, addUsage, type TokenUsage } from "../../providers/ai";
import type { SummarizingServiceContext } from "../../providers/types";
import {
  groupChunksBySection,
  truncateSectionText,
  buildSummaryVectorPoints,
  type SectionDbRecord,
} from "./summarizeLogic";

const MAX_SECTION_CHUNKS_CHARS = 8000;

export type SummarizingInput = {
  documentId: string;
  userId: string;
  documentTitle: string;
  language?: string;
  chunks: Array<{
    content: string;
    chunkIndex: number;
    sectionTitle?: string;
  }>;
  staleVectorIds: string[];
  idToUuid: (seed: string) => string;
};

export type SummarizingMetrics = {
  sectionGroups: number;
  sectionSummariesGenerated: number;
  docSummaryLength: number;
  staleVectorsDeleted: number;
  vectorsUpserted: number;
};

export type SummarizingResult = {
  docSummary: string;
  docEmbeddingId: string;
  sectionDbRecords: SectionDbRecord[];
  llmTokenUsage: TokenUsage;
  embeddingUsage?: { tokens: number };
  metrics: SummarizingMetrics;
};

export async function summarizeDocumentLogic({
  input,
  services,
}: {
  input: SummarizingInput;
  services: SummarizingServiceContext;
}): Promise<SummarizingResult | null> {
  const { documentId, userId, documentTitle, language, chunks, staleVectorIds, idToUuid } = input;

  const groups = groupChunksBySection(chunks);

  const sectionCandidates = await Promise.all(
    groups.map(async (group) => {
      const combinedText = truncateSectionText(group.chunks, MAX_SECTION_CHUNKS_CHARS);
      const { summary, isSubstantiveContent, usage } = await services.llm.generateSectionSummary({
        sectionTitle: group.sectionTitle,
        combinedText,
        language,
      });
      if (!summary) return null;

      const indices = group.chunks.map((c) => c.chunkIndex);
      return {
        sectionTitle: group.sectionTitle,
        summary,
        isSubstantiveContent,
        chunkStartIndex: Math.min(...indices),
        chunkEndIndex: Math.max(...indices),
        usage,
      };
    }),
  );

  const sectionResults = sectionCandidates.filter((r): r is NonNullable<typeof r> => r !== null);

  let llmTokenUsage = sectionResults.reduce((acc, r) => addUsage(acc, r.usage), ZERO_USAGE);

  if (sectionResults.length === 0) {
    return null;
  }

  const substantiveSections = sectionResults.filter((s) => s.isSubstantiveContent);
  const docSummaryInput = substantiveSections.length > 0 ? substantiveSections : sectionResults;

  const { summary: docSummary, usage: docSummaryUsage } =
    await services.llm.generateDocumentSummary({
      sectionSummaries: docSummaryInput,
      documentTitle,
      language,
    });
  llmTokenUsage = addUsage(llmTokenUsage, docSummaryUsage);

  const allTexts = [docSummary, ...sectionResults.map((s) => s.summary)];
  const allVectors = await services.embedder.embed(allTexts);

  const { docPoint, docEmbeddingId, sectionPoints, sectionDbRecords } = buildSummaryVectorPoints({
    documentId,
    userId,
    docSummary,
    sectionResults,
    vectors: allVectors,
    idToUuid,
  });

  if (staleVectorIds.length > 0) {
    await services.summaryStore.delete(staleVectorIds);
  }

  await services.summaryStore.upsert([docPoint, ...sectionPoints]);

  return {
    docSummary,
    docEmbeddingId,
    sectionDbRecords,
    llmTokenUsage,
    embeddingUsage: services.embedder.lastUsage,
    metrics: {
      sectionGroups: groups.length,
      sectionSummariesGenerated: sectionResults.length,
      docSummaryLength: docSummary.length,
      staleVectorsDeleted: staleVectorIds.length,
      vectorsUpserted: 1 + sectionPoints.length,
    },
  };
}
