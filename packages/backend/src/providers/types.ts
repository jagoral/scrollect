import type { ModelAlias, TokenUsage } from "./ai";
export type { ModelAlias, TokenUsage } from "./ai";

export interface CardGenerationService {
  generateCards(opts: { systemPrompt: string; userPrompt: string; cardCount: number }): Promise<{
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
    model: ModelAlias;
    documentId?: string;
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
  documentId?: string;
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
    language?: string;
  }): Promise<{ summary: string; isSubstantiveContent: boolean; usage: TokenUsage }>;

  generateDocumentSummary(opts: {
    sectionSummaries: Array<{ sectionTitle: string; summary: string }>;
    documentTitle: string;
    language?: string;
  }): Promise<{ summary: string; usage: TokenUsage }>;
}

export interface TaggingLlm {
  suggestTags(opts: { prompt: string }): Promise<{ tags: string[]; usage: TokenUsage }>;
}

/** Card types eligible for draft generation (excludes "connection"). Standalone mirror of the Convex validator type. */
export type DraftCardType = "insight" | "quiz" | "quote" | "summary";

/** Discriminated union describing per-card-type metadata. Standalone mirror of the Convex validator type. */
export type TypeData =
  | { type: "insight" }
  | {
      type: "quiz";
      variant: "multiple_choice" | "true_false";
      question: string;
      options: string[];
      correctIndex: number;
      explanation: string;
    }
  | { type: "quote"; quotedText: string; attribution?: string }
  | { type: "summary"; bulletPoints: string[] }
  | {
      type: "connection";
      sourceATitleHint: string;
      sourceBTitleHint: string;
      sourceAKeyIdea?: string;
      sourceBKeyIdea?: string;
      similarityScore?: number;
      connectionType?: "cross_document" | "within_document";
    };

export interface CardDraftLlm {
  generateDraft(opts: {
    cardType: DraftCardType;
    sectionSummary: string;
    sectionTitle: string;
    chunks: Array<{ content: string; chunkId: string }>;
    documentTitle: string;
    language?: string;
    fileType?: string;
  }): Promise<{
    card: { content: string; typeData: Record<string, unknown> };
    usage: TokenUsage;
  }>;
}

export type ValidationResult = {
  isValid: boolean;
  rejectionReason?: string;
  usage: TokenUsage;
};

export interface CardDraftValidator {
  validateDraft(opts: {
    cardType: DraftCardType;
    content: string;
    typeData: Record<string, unknown>;
    sectionTitle: string;
    documentTitle: string;
  }): Promise<ValidationResult>;
}

export interface ThematicLlm {
  discoverThemes(opts: {
    sectionSummaries: Array<{ sectionTitle: string; summary: string }>;
    documentTitle: string;
    language?: string;
  }): Promise<{
    themes: Array<{ title: string; description: string; relevantSections: string[] }>;
    usage: TokenUsage;
  }>;
}

export interface ConnectionDiscoveryLlm {
  /** Generate a connection card from two related sections. Returns null if the LLM rejects the pair as trivial. */
  generateConnectionDraft(opts: {
    sectionA: {
      title: string;
      summary: string;
      chunks: Array<{ content: string; chunkId: string }>;
    };
    sectionB: {
      title: string;
      summary: string;
      chunks: Array<{ content: string; chunkId: string }>;
    };
    documentATitle: string;
    documentBTitle: string;
    language?: string;
  }): Promise<{
    card: { content: string; typeData: Record<string, unknown> } | null;
    usage: TokenUsage;
  }>;
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

export type ExtractionServiceContext = {
  articleExtractor: ContentExtractor;
  youtubeExtractor: ContentExtractor;
};

export type TaggingServiceContext = {
  llm: TaggingLlm;
};

export type DraftGenerationServiceContext = {
  llm: CardDraftLlm;
  validator?: CardDraftValidator;
};

export type ThematicDraftGenerationServiceContext = {
  thematicLlm: ThematicLlm;
  draftLlm: CardDraftLlm;
  embedder: EmbeddingProvider;
  vectorStore: VectorStore;
};

export type ConnectionDiscoveryServiceContext = {
  llm: ConnectionDiscoveryLlm;
  summaryStore: SummaryVectorStore;
  embedder: EmbeddingProvider;
};

export interface HighlightDraftLlm {
  generateDraftsFromHighlights(opts: {
    highlights: Array<{ highlightId: string; highlightText: string }>;
    sectionSummary: string;
    sectionTitle: string;
    chunks: Array<{ content: string; chunkId: string }>;
    documentTitle: string;
    language?: string;
  }): Promise<{
    cards: Array<{
      highlightId: string;
      content: string;
      cardType: DraftCardType;
      typeData: Record<string, unknown>;
    }>;
    usage: TokenUsage;
  }>;
}

export type HighlightDraftGenerationServiceContext = {
  llm: HighlightDraftLlm;
};

export type VectorDeletionServices = {
  vectorStore: VectorStore;
  summaryStore: SummaryVectorStore;
};
