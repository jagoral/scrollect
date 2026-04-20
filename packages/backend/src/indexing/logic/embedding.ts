import type { EmbeddingServiceContext, VectorPoint } from "../../providers/types";

export type EmbedBatchInput = {
  chunks: Array<{
    _id: string;
    content: string;
    chunkIndex: number;
    embedded: boolean;
  }>;
  documentId: string;
  userId: string;
  idToUuid: (id: string) => string;
};

export type EmbedBatchMetrics = {
  validChunkCount: number;
  embedDurationMs: number;
  upsertDurationMs: number;
};

export type EmbedBatchResult = {
  points: VectorPoint[];
  embeddedChunks: Array<{ chunkId: string; embeddingId: string }>;
  embeddingUsage?: { tokens: number };
  metrics: EmbedBatchMetrics;
};

export async function embedBatchLogic({
  input,
  services,
}: {
  input: EmbedBatchInput;
  services: EmbeddingServiceContext;
}): Promise<EmbedBatchResult> {
  const { chunks, documentId, userId, idToUuid } = input;

  const validChunks = chunks.filter((c) => !c.embedded);

  if (validChunks.length === 0) {
    return {
      points: [],
      embeddedChunks: [],
      metrics: { validChunkCount: 0, embedDurationMs: 0, upsertDurationMs: 0 },
    };
  }

  const texts = validChunks.map((c) => c.content);

  const t0 = Date.now();
  const vectors = await services.embedder.embed(texts);
  const embedDurationMs = Date.now() - t0;

  const points: VectorPoint[] = validChunks.map((chunk, i) => ({
    id: idToUuid(chunk._id),
    vector: vectors[i]!,
    payload: {
      chunkId: chunk._id,
      documentId,
      chunkIndex: chunk.chunkIndex,
      userId,
    },
  }));

  const t1 = Date.now();
  await services.vectorStore.upsert(points);
  const upsertDurationMs = Date.now() - t1;

  const embeddedChunks = validChunks.map((chunk) => ({
    chunkId: chunk._id,
    embeddingId: idToUuid(chunk._id),
  }));

  return {
    points,
    embeddedChunks,
    embeddingUsage: services.embedder.lastUsage,
    metrics: {
      validChunkCount: validChunks.length,
      embedDurationMs,
      upsertDurationMs,
    },
  };
}
