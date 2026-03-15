import type {
  SummarySearchResult,
  SummaryVectorFilter,
  SummaryVectorPoint,
  SummaryVectorStore,
  VectorFilter,
  VectorPoint,
  VectorSearchResult,
  VectorStore,
} from "./types";

const COLLECTION_NAME = "scrollect_chunks";
const SUMMARY_COLLECTION_NAME = "scrollect_summaries";

type QdrantHttpClientConfig = {
  url: string;
  apiKey: string;
  vectorSize?: number;
};

class QdrantHttpClient {
  readonly url: string;
  readonly apiKey: string;
  readonly vectorSize: number;

  constructor(config: QdrantHttpClientConfig) {
    this.url = config.url.replace(/\/+$/, "");
    this.apiKey = config.apiKey;
    this.vectorSize = config.vectorSize ?? 1536;
  }

  async request(path: string, options: RequestInit = {}): Promise<unknown> {
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

  async ensureCollection(collectionName: string): Promise<void> {
    const data = (await this.request("/collections")) as {
      result: { collections: Array<{ name: string }> };
    };
    const exists = data.result.collections.some((c) => c.name === collectionName);
    if (exists) return;

    try {
      await this.request(`/collections/${collectionName}`, {
        method: "PUT",
        body: JSON.stringify({
          vectors: { size: this.vectorSize, distance: "Cosine" },
        }),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const isAlreadyExists = /40[09]/.test(message) || /already exists/i.test(message);
      if (!isAlreadyExists) throw error;
    }
  }
}

/**
 * Qdrant vector store implementation.
 *
 * Uses the Qdrant REST API directly (no SDK dependency) to keep the provider
 * lightweight and compatible with Convex's action runtime.
 */
export class QdrantVectorStore implements VectorStore {
  private client: QdrantHttpClient;
  private collectionReady = false;

  constructor(url: string, apiKey: string, vectorSize: number = 1536) {
    this.client = new QdrantHttpClient({ url, apiKey, vectorSize });
  }

  async ensureCollection(): Promise<void> {
    if (this.collectionReady) return;
    await this.client.ensureCollection(COLLECTION_NAME);
    this.collectionReady = true;
  }

  async upsert(points: VectorPoint[]): Promise<void> {
    if (points.length === 0) return;

    await this.ensureCollection();
    await this.client.request(`/collections/${COLLECTION_NAME}/points?wait=true`, {
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
    const data = (await this.client.request(`/collections/${COLLECTION_NAME}/points/search`, {
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

    await this.client.request(`/collections/${COLLECTION_NAME}/points/delete?wait=true`, {
      method: "POST",
      body: JSON.stringify({ points: ids }),
    });
  }
}

export class QdrantSummaryStore implements SummaryVectorStore {
  private client: QdrantHttpClient;
  private collectionReady = false;

  constructor(url: string, apiKey: string, vectorSize: number = 1536) {
    this.client = new QdrantHttpClient({ url, apiKey, vectorSize });
  }

  async ensureCollection(): Promise<void> {
    if (this.collectionReady) return;
    await this.client.ensureCollection(SUMMARY_COLLECTION_NAME);
    this.collectionReady = true;
  }

  async upsert(points: SummaryVectorPoint[]): Promise<void> {
    if (points.length === 0) return;

    await this.ensureCollection();
    await this.client.request(`/collections/${SUMMARY_COLLECTION_NAME}/points?wait=true`, {
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
    filter: SummaryVectorFilter,
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

    const data = (await this.client.request(
      `/collections/${SUMMARY_COLLECTION_NAME}/points/search`,
      {
        method: "POST",
        body: JSON.stringify({
          vector,
          limit: topK,
          filter: { must },
          with_payload: true,
        }),
      },
    )) as {
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

    await this.client.request(`/collections/${SUMMARY_COLLECTION_NAME}/points/delete?wait=true`, {
      method: "POST",
      body: JSON.stringify({ points: ids }),
    });
  }
}
