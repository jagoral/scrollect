export interface ExtractResult {
  /** Extracted content as markdown. */
  markdown: string;
  /** Title auto-extracted from the source. */
  title?: string;
  /** Structured metadata (timestamps, segments, etc.) */
  metadata?: Record<string, unknown>;
}

export interface ContentExtractor {
  /** Extract markdown content from a URL. */
  extract(url: string): Promise<ExtractResult>;
}

export interface PollResult {
  status: "pending" | "complete" | "error";
  markdown?: string;
  errorMessage?: string;
}

export interface PdfParser {
  /** Submit a PDF for parsing. Returns a check URL for polling. */
  submit(fileUrl: string): Promise<string>;

  /** Poll for parsing result. */
  poll(checkUrl: string): Promise<PollResult>;
}

export interface EmbeddingProvider {
  /** The dimensionality of the embedding vectors. */
  readonly dimensions: number;

  /** Generate embeddings for a batch of texts. Returns one vector per input text. */
  embed(texts: string[]): Promise<number[][]>;
}

export interface VectorPoint {
  /** Deterministic ID derived from chunk ID for idempotent upserts. */
  id: string;
  vector: number[];
  payload: {
    chunkId: string;
    documentId: string;
    chunkIndex: number;
    userId: string;
  };
}

export interface VectorFilter {
  userId: string;
}

export interface VectorSearchResult {
  id: string;
  score: number;
  payload: VectorPoint["payload"];
}

export interface VectorStore {
  /** Ensure the backing collection/index exists. Idempotent. */
  ensureCollection(): Promise<void>;

  /** Upsert vectors. Overwrites existing points with the same ID. */
  upsert(points: VectorPoint[]): Promise<void>;

  /** Search for similar vectors, filtered by userId. */
  search(vector: number[], filter: VectorFilter, topK: number): Promise<VectorSearchResult[]>;

  /** Delete vectors by ID. */
  delete(ids: string[]): Promise<void>;
}
