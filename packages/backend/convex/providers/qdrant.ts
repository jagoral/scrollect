import type {
  SummarySearchResult,
  SummaryVectorPoint,
  SummaryVectorStore,
  VectorFilter,
  VectorPoint,
  VectorSearchResult,
  VectorStore,
} from "./types";

const COLLECTION_NAME = "scrollect_chunks";
const SUMMARY_COLLECTION_NAME = "scrollect_summaries";

/**
 * Qdrant vector store implementation.
 *
 * Uses the Qdrant REST API directly (no SDK dependency) to keep the provider
 * lightweight and compatible with Convex's action runtime.
 */
export class QdrantVectorStore implements VectorStore {
  private url: string;
  private apiKey: string;
  private vectorSize: number;

  constructor(url: string, apiKey: string, vectorSize: number = 1536) {
    // Strip trailing slash for consistent URL construction
    this.url = url.replace(/\/+$/, "");
    this.apiKey = apiKey;
    this.vectorSize = vectorSize;
  }

  private async request(path: string, options: RequestInit = {}): Promise<unknown> {
    const response = await fetch(`${this.url}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "api-key": this.apiKey,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Qdrant ${options.method ?? "GET"} ${path} failed: ${response.status} ${body}`,
      );
    }

    return response.json();
  }

  async ensureCollection(): Promise<void> {
    const data = (await this.request("/collections")) as {
      result: { collections: Array<{ name: string }> };
    };
    const exists = data.result.collections.some((c) => c.name === COLLECTION_NAME);
    if (!exists) {
      await this.request(`/collections/${COLLECTION_NAME}`, {
        method: "PUT",
        body: JSON.stringify({
          vectors: { size: this.vectorSize, distance: "Cosine" },
        }),
      });
    }
  }

  async upsert(points: VectorPoint[]): Promise<void> {
    if (points.length === 0) return;

    await this.request(`/collections/${COLLECTION_NAME}/points?wait=true`, {
      method: "PUT",
      body: JSON.stringify({
        points: points.map((p) => ({
          id: p.id,
          vector: p.vector,
          payload: p.payload,
        })),
      }),
    });
  }

  async search(
    vector: number[],
    filter: VectorFilter,
    topK: number,
  ): Promise<VectorSearchResult[]> {
    const data = (await this.request(`/collections/${COLLECTION_NAME}/points/search`, {
      method: "POST",
      body: JSON.stringify({
        vector,
        limit: topK,
        filter: {
          must: [{ key: "userId", match: { value: filter.userId } }],
        },
        with_payload: true,
      }),
    })) as { result: Array<{ id: string; score: number; payload: VectorPoint["payload"] }> };

    return data.result.map((r) => ({
      id: r.id,
      score: r.score,
      payload: r.payload,
    }));
  }

  async delete(ids: string[]): Promise<void> {
    if (ids.length === 0) return;

    await this.request(`/collections/${COLLECTION_NAME}/points/delete?wait=true`, {
      method: "POST",
      body: JSON.stringify({ points: ids }),
    });
  }
}

export class QdrantSummaryStore implements SummaryVectorStore {
  private url: string;
  private apiKey: string;
  private vectorSize: number;

  constructor(url: string, apiKey: string, vectorSize: number = 1536) {
    this.url = url.replace(/\/+$/, "");
    this.apiKey = apiKey;
    this.vectorSize = vectorSize;
  }

  private async request(path: string, options: RequestInit = {}): Promise<unknown> {
    const response = await fetch(`${this.url}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "api-key": this.apiKey,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Qdrant ${options.method ?? "GET"} ${path} failed: ${response.status} ${body}`,
      );
    }

    return response.json();
  }

  async ensureCollection(): Promise<void> {
    const data = (await this.request("/collections")) as {
      result: { collections: Array<{ name: string }> };
    };
    const exists = data.result.collections.some((c) => c.name === SUMMARY_COLLECTION_NAME);
    if (!exists) {
      await this.request(`/collections/${SUMMARY_COLLECTION_NAME}`, {
        method: "PUT",
        body: JSON.stringify({
          vectors: { size: this.vectorSize, distance: "Cosine" },
        }),
      });
    }
  }

  async upsert(points: SummaryVectorPoint[]): Promise<void> {
    if (points.length === 0) return;

    await this.ensureCollection();
    await this.request(`/collections/${SUMMARY_COLLECTION_NAME}/points?wait=true`, {
      method: "PUT",
      body: JSON.stringify({
        points: points.map((p) => ({
          id: p.id,
          vector: p.vector,
          payload: p.payload,
        })),
      }),
    });
  }

  async search(
    vector: number[],
    filter: VectorFilter & { summaryType?: "document" | "section"; documentIds?: string[] },
    topK: number,
  ): Promise<SummarySearchResult[]> {
    const must: Array<Record<string, unknown>> = [
      { key: "userId", match: { value: filter.userId } },
    ];
    if (filter.summaryType) {
      must.push({ key: "summaryType", match: { value: filter.summaryType } });
    }
    if (filter.documentIds && filter.documentIds.length > 0) {
      must.push({ key: "documentId", match: { any: filter.documentIds } });
    }

    const data = (await this.request(`/collections/${SUMMARY_COLLECTION_NAME}/points/search`, {
      method: "POST",
      body: JSON.stringify({
        vector,
        limit: topK,
        filter: { must },
        with_payload: true,
      }),
    })) as {
      result: Array<{ id: string; score: number; payload: SummaryVectorPoint["payload"] }>;
    };

    return data.result.map((r) => ({
      id: r.id,
      score: r.score,
      payload: r.payload,
    }));
  }

  async delete(ids: string[]): Promise<void> {
    if (ids.length === 0) return;

    await this.request(`/collections/${SUMMARY_COLLECTION_NAME}/points/delete?wait=true`, {
      method: "POST",
      body: JSON.stringify({ points: ids }),
    });
  }
}
