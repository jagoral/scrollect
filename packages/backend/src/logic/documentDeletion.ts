import type { VectorDeletionServices } from "../providers/types";

export type DocumentVectorDeletionInput = {
  chunkEmbeddingIds: string[];
  sectionSummaryEmbeddingIds: string[];
  documentSummaryEmbeddingId?: string;
};

export type DocumentVectorDeletionResult = {
  deletedChunkVectorCount: number;
  deletedSummaryVectorCount: number;
};

export async function deleteDocumentVectors({
  input,
  services,
}: {
  input: DocumentVectorDeletionInput;
  services: VectorDeletionServices;
}): Promise<DocumentVectorDeletionResult> {
  const { chunkEmbeddingIds, sectionSummaryEmbeddingIds, documentSummaryEmbeddingId } = input;

  const summaryVectorIds = [
    ...sectionSummaryEmbeddingIds,
    ...(documentSummaryEmbeddingId ? [documentSummaryEmbeddingId] : []),
  ];

  await Promise.all([
    services.vectorStore.delete(chunkEmbeddingIds),
    services.summaryStore.delete(summaryVectorIds),
  ]);

  return {
    deletedChunkVectorCount: chunkEmbeddingIds.length,
    deletedSummaryVectorCount: summaryVectorIds.length,
  };
}
