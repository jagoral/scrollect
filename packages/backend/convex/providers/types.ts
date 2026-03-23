export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export interface CardGenerationService {
  generateCards(opts: { systemPrompt: string; userPrompt: string }): Promise<{
    cards: Record<string, unknown>[];
    usage: TokenUsage;
  }>;
}

export interface AnalyticsService {
  captureEvent(opts: {
    distinctId: string;
    event: string;
    properties?: Record<string, unknown>;
  }): Promise<void>;

  captureAiUsage(opts: {
    distinctId: string;
    operation: string;
    usage: TokenUsage;
    modelType: "llm" | "embedding";
    documentId?: string;
    model?: string;
  }): Promise<void>;
}

export interface ContentFetcher {
  fetchContent(chunkIds: string[]): Promise<Map<string, string>>;
}

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

export interface DocumentParser {
  /** Submit a document for parsing. Returns a check URL for polling. */
  submit(fileUrl: string): Promise<string>;

  /** Poll for parsing result. */
  poll(checkUrl: string): Promise<PollResult>;
}

export interface EmbeddingProvider {
  /** The dimensionality of the embedding vectors. */
  readonly dimensions: number;

  /** Token usage from the most recent embed() call. */
  lastUsage?: { tokens: number };

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

export interface SummaryVectorPoint {
  id: string;
  vector: number[];
  payload: {
    documentId: string;
    userId: string;
    summaryType: "document" | "section";
    sectionTitle?: string;
  };
}

export interface VectorFilter {
  userId: string;
}

export interface SummaryVectorFilter extends VectorFilter {
  summaryType?: "document" | "section";
  documentIds?: string[];
}

export interface VectorSearchResult {
  id: string;
  score: number;
  payload: VectorPoint["payload"];
}

export interface SummarySearchResult {
  id: string;
  score: number;
  payload: SummaryVectorPoint["payload"];
}

export interface SearchExcludingDocumentParams {
  vector: number[];
  userId: string;
  excludeDocumentId: string;
  topK: number;
}

export interface VectorStore {
  /** Ensure the backing collection/index exists. Idempotent. */
  ensureCollection(): Promise<void>;

  /** Upsert vectors. Overwrites existing points with the same ID. */
  upsert(points: VectorPoint[]): Promise<void>;

  /** Search for similar vectors, filtered by userId. */
  search(vector: number[], filter: VectorFilter, topK: number): Promise<VectorSearchResult[]>;

  /** Search for similar vectors, excluding results from a specific document. */
  searchExcludingDocument(params: SearchExcludingDocumentParams): Promise<VectorSearchResult[]>;

  /** Delete vectors by ID. */
  delete(ids: string[]): Promise<void>;
}

export type FeedServiceContext = {
  cardGenerator: CardGenerationService;
  embedder: EmbeddingProvider;
  vectorStore: VectorStore;
  summaryStore: SummaryVectorStore;
  analytics: AnalyticsService;
  contentFetcher: ContentFetcher;
};

export interface SummaryVectorStore {
  /** Ensure the summary collection exists. Idempotent. */
  ensureCollection(): Promise<void>;

  /** Upsert summary vectors. */
  upsert(points: SummaryVectorPoint[]): Promise<void>;

  /** Search summary vectors, optionally filtering by summaryType. */
  search(
    vector: number[],
    filter: SummaryVectorFilter,
    topK: number,
  ): Promise<SummarySearchResult[]>;

  /** Delete summary vectors by ID. */
  delete(ids: string[]): Promise<void>;
}

export interface SummarizingLlm {
  generateSectionSummary(opts: {
    sectionTitle: string;
    combinedText: string;
  }): Promise<{ summary: string; usage: TokenUsage }>;

  generateDocumentSummary(opts: {
    sectionSummaries: Array<{ sectionTitle: string; summary: string }>;
    documentTitle: string;
  }): Promise<{ summary: string; usage: TokenUsage }>;
}

export interface TaggingLlm {
  suggestTags(opts: { prompt: string }): Promise<{ tags: string[]; usage: TokenUsage }>;
}

export type SummarizingServiceContext = {
  llm: SummarizingLlm;
  embedder: EmbeddingProvider;
  summaryStore: SummaryVectorStore;
};

export type EmbeddingServiceContext = {
  embedder: EmbeddingProvider;
  vectorStore: VectorStore;
};

export type ParsingServiceContext = {
  parser: DocumentParser;
};

export type ExtractionServiceContext = {
  articleExtractor: ContentExtractor;
  youtubeExtractor: ContentExtractor;
};

export type TaggingServiceContext = {
  llm: TaggingLlm;
};

export type VectorDeletionServices = {
  vectorStore: VectorStore;
  summaryStore: SummaryVectorStore;
};
