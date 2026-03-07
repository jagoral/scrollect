import type { ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import type { VectorFilter, VectorPoint, VectorSearchResult, VectorStore } from "./types";

/**
 * Convex native vector search implementation.
 *
 * This is the recommended starting point per ADR-001: it requires no external
 * services, has zero network latency, and is fully managed by Convex.
 *
 * The VectorStore interface enables swapping to Qdrant if richer filtering
 * or higher scale is needed in the future.
 *
 * Requires a `vectorIndex("by_embedding", ...)` on the chunks table in schema.ts.
 * See ADR-001 "Vector Store Decision" section for the schema addition.
 */
export class ConvexVectorStore implements VectorStore {
  private ctx: ActionCtx;
  private upsertRef: unknown;
  private deleteRef: unknown;

  constructor(ctx: ActionCtx, upsertRef: unknown, deleteRef: unknown) {
    this.ctx = ctx;
    this.upsertRef = upsertRef;
    this.deleteRef = deleteRef;
  }

  async ensureCollection(): Promise<void> {
    // No-op: Convex vector indexes are defined in the schema
  }

  async upsert(points: VectorPoint[]): Promise<void> {
    if (points.length === 0) return;

    // Store embeddings directly in the chunks table via internal mutation
    await (this.ctx as ActionCtx).runMutation(
      this.upsertRef as never,
      {
        points: points.map((p) => ({
          chunkId: p.payload.chunkId as Id<"chunks">,
          embedding: p.vector,
        })),
      } as never,
    );
  }

  async search(
    vector: number[],
    filter: VectorFilter,
    topK: number,
  ): Promise<VectorSearchResult[]> {
    const results = await this.ctx.vectorSearch("chunks", "by_embedding", {
      vector,
      limit: topK,
      filter: (q: { eq: (field: string, value: string) => unknown }) =>
        q.eq("userId", filter.userId),
    } as never);

    return (
      results as Array<{
        _id: string;
        _score: number;
        documentId: string;
        chunkIndex: number;
      }>
    ).map((r) => ({
      id: r._id,
      score: r._score,
      payload: {
        chunkId: r._id,
        documentId: r.documentId,
        chunkIndex: r.chunkIndex,
        userId: filter.userId,
      },
    }));
  }

  async delete(ids: string[]): Promise<void> {
    if (ids.length === 0) return;

    await (this.ctx as ActionCtx).runMutation(this.deleteRef as never, { chunkIds: ids } as never);
  }
}
