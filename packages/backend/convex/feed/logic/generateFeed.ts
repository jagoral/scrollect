import type { ConnectionPair } from "./discovery";
import { discoverConnections } from "./discovery";
import { buildHighlightContext, buildSystemPrompt, resolveLanguage } from "./feedPrompt";
import type {
  ChunkInfo,
  ChunkMetadata,
  DocumentSummaryInfo,
  PostSourceRecord,
  SectionSummaryInfo,
} from "./sampling";
import {
  buildChunkUsageMap,
  buildTypeCoverageHint,
  semanticSelect,
  weightedSample,
} from "./sampling";
import { interleaveCards } from "./interleaving";
import { buildSummaryContext, type LearningGoalEntry } from "./selectionLogic";
import {
  buildConnectionPairMap,
  enrichConnectionCard,
  mergeConnectionChunks,
} from "./connectionEnrichment";
import type { RawCard } from "./validation";
import { validateCard } from "./validation";
import type { FeedServiceContext } from "../../providers/types";
import type { TypeData } from "../../lib/validators";

const SATURATION_THRESHOLD = 0.8;

export type DocumentInfo = {
  _id: string;
  title: string;
  createdAt: number;
  language?: string;
  summary?: string;
  summaryEmbeddingId?: string;
  learningGoal?: string;
};

export type HighlightLike = {
  documentId: string;
  text: string;
  note?: string;
};

export type FeedInputData = {
  documents: DocumentInfo[];
  allChunks: ChunkMetadata[];
  recentSources: PostSourceRecord[];
  recentPosts: { _id: string; postType: string }[];
  recentHashes: ReadonlySet<string>;
  sectionSummaries: SectionSummaryInfo[];
  highlights: HighlightLike[];
  highlightedChunkIds?: Set<string>;
  userId: string;
  now: number;
};

export type ValidatedCard = {
  card: RawCard;
  chunks: ChunkInfo[];
};

export type GenerateFeedMetrics = {
  saturationRatio?: number;
  saturationWarning?: boolean;
  selectionMethod?: string;
  selectedChunks?: number;
  connectionPairsFound?: number;
  connectionDiscoveryFailed?: boolean;
  connectionDiscoveryError?: string;
  feedLanguage?: string;
  hydratedChunks?: number;
  finalCardCount?: number;
  dedupSkipped?: number;
  interleavedCount?: number;
  [key: `attempt_${number}_${"total" | "valid" | "dropped"}`]: number;
};

export type GenerateFeedResult = {
  cards: ValidatedCard[];
  selectionMethod: string;
  tokenUsage: { inputTokens: number; outputTokens: number; totalTokens: number };
  metrics: GenerateFeedMetrics;
};

export async function generateFeed(opts: {
  data: FeedInputData;
  services: FeedServiceContext;
  cardCount: number;
}): Promise<GenerateFeedResult> {
  const { data, services, cardCount } = opts;
  const {
    documents,
    allChunks,
    recentSources,
    recentPosts,
    sectionSummaries,
    highlights,
    highlightedChunkIds,
    userId,
    now,
  } = data;
  const metrics: GenerateFeedMetrics = {};

  if (allChunks.length === 0) {
    throw new Error("No chunks available to generate feed from.");
  }

  const docCreatedAtMap = new Map<string, number>(documents.map((d) => [d._id, d.createdAt]));
  const chunkUsageMap = buildChunkUsageMap(recentSources, recentPosts);
  const recentHashes = new Set(data.recentHashes);

  const usedChunkCount = chunkUsageMap.size;
  const saturationRatio = allChunks.length > 0 ? usedChunkCount / allChunks.length : 0;
  metrics.saturationRatio = saturationRatio;
  if (saturationRatio > SATURATION_THRESHOLD) {
    metrics.saturationWarning = true;
  }

  const sampleSize = Math.max(cardCount * 2, 10);

  const docSummaries: DocumentSummaryInfo[] = documents
    .filter((d) => d.summary && d.summaryEmbeddingId)
    .map((d) => ({
      documentId: d._id,
      documentTitle: d.title,
      summary: d.summary!,
      summaryEmbeddingId: d.summaryEmbeddingId!,
    }));

  let selected: ChunkMetadata[];
  let selectionMethod: string;
  if (docSummaries.length > 0) {
    selected = await semanticSelect({
      allChunks,
      docSummaries,
      chunkUsageMap,
      docCreatedAtMap,
      highlightedChunkIds,
      count: sampleSize,
      userId,
      embedder: services.embedder,
      summaryStore: services.summaryStore,
      now,
    });
    selectionMethod = "semantic";
  } else {
    selected = weightedSample({
      chunks: allChunks,
      chunkUsageMap,
      highlightedChunkIds,
      docCreatedAtMap,
      count: sampleSize,
      now,
    });
    selectionMethod = "weighted";
  }
  metrics.selectionMethod = selectionMethod;
  metrics.selectedChunks = selected.length;

  let connectionPairs: ConnectionPair[] = [];
  if (allChunks.length >= 2) {
    try {
      connectionPairs = await discoverConnections({
        allChunks,
        userId,
        embedder: services.embedder,
        vectorStore: services.vectorStore,
        fetchContent: (ids) => services.contentFetcher.fetchContent(ids),
        maxPairs: Math.max(1, Math.floor(cardCount / 5)),
      });
      metrics.connectionPairsFound = connectionPairs.length;
    } catch (error) {
      metrics.connectionDiscoveryFailed = true;
      metrics.connectionDiscoveryError = error instanceof Error ? error.message : String(error);
    }
  }

  const { merged: selectedWithConnections, connectionHints } = mergeConnectionChunks({
    selected,
    connectionPairs,
  });

  const contentMap = await services.contentFetcher.fetchContent(
    selectedWithConnections.map((c) => c._id),
  );
  metrics.hydratedChunks = contentMap.size;

  const hydratedChunks: ChunkInfo[] = selectedWithConnections.map((c) => ({
    ...c,
    content: contentMap.get(c._id) ?? "",
  }));

  const docLanguageMap = new Map<string, string | undefined>(
    documents.map((d) => [d._id, d.language]),
  );
  const feedLanguage = resolveLanguage(hydratedChunks, docLanguageMap);
  if (feedLanguage) metrics.feedLanguage = feedLanguage;

  const typeCoverageHint = buildTypeCoverageHint(chunkUsageMap);
  const systemPrompt =
    buildSystemPrompt({ chunkCount: hydratedChunks.length, cardCount, language: feedLanguage }) +
    typeCoverageHint;

  const selectedDocIds = new Set(hydratedChunks.map((c) => c.documentId));
  const learningGoals = new Map<string, LearningGoalEntry>();
  for (const doc of documents) {
    if (doc.learningGoal) {
      learningGoals.set(doc._id, { title: doc.title, goal: doc.learningGoal });
    }
  }

  const summaryContext = buildSummaryContext({
    docSummaries,
    sectionSummaries,
    selectedDocIds,
    learningGoals,
  });

  const highlightContext = buildHighlightContext(highlights, selectedDocIds);

  const userPrompt =
    summaryContext +
    highlightContext +
    hydratedChunks
      .map((chunk, i) => `Chunk ${i} (from "${chunk.documentTitle}"):\n${chunk.content}`)
      .join("\n\n---\n\n") +
    (connectionHints.length > 0
      ? `\n\n---\n\nDISCOVERED CONNECTIONS (use these to create connection cards):\n${connectionHints.join("\n")}`
      : "");

  const connectionPairMap = buildConnectionPairMap(connectionPairs, hydratedChunks);
  const documentCount = documents.length;

  let validCards: ValidatedCard[] = [];
  let generationAttempts = 0;
  const maxBatchRetries = 2;
  const generationTokens = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

  while (validCards.length < cardCount && generationAttempts <= maxBatchRetries) {
    generationAttempts++;
    const { cards: rawCards, usage } = await services.cardGenerator.generateCards({
      systemPrompt,
      userPrompt,
      cardCount,
    });
    generationTokens.inputTokens += usage.inputTokens;
    generationTokens.outputTokens += usage.outputTokens;
    generationTokens.totalTokens += usage.totalTokens;

    const cards = rawCards as RawCard[];

    const validated: ValidatedCard[] = [];
    const dropped: string[] = [];
    for (const card of cards) {
      if (validateCard({ card, chunks: hydratedChunks, documentCount })) {
        const cardChunks = card.sourceChunkIndices.map((i) => hydratedChunks[i]!);
        if (card.type === "connection") {
          enrichConnectionCard({ card, cardChunks, connectionPairMap });
        }
        validated.push({ card, chunks: cardChunks });
      } else {
        dropped.push(`${card.type ?? "unknown"}: missing fields`);
      }
    }

    metrics[`attempt_${generationAttempts}_total`] = cards.length;
    metrics[`attempt_${generationAttempts}_valid`] = validated.length;
    metrics[`attempt_${generationAttempts}_dropped`] = dropped.length;

    if (validated.length > 0 && cards.length > 0 && dropped.length / cards.length <= 0.5) {
      validCards = validated;
      break;
    }

    if (validated.length > validCards.length) {
      validCards = validated;
    }
  }

  metrics.finalCardCount = validCards.length;

  let dedupSkipped = 0;
  const dedupedCards: ValidatedCard[] = [];
  for (const entry of validCards.slice(0, cardCount)) {
    const candidateHash = entry.chunks
      .map((c) => c._id)
      .sort()
      .join("+");
    if (recentHashes.has(candidateHash)) {
      dedupSkipped++;
      continue;
    }
    recentHashes.add(candidateHash);
    dedupedCards.push(entry);
  }
  metrics.dedupSkipped = dedupSkipped;

  const interleaved = interleaveCards({
    cards: dedupedCards,
    getType: (entry) => entry.card.type,
  });
  metrics.interleavedCount = interleaved.length;

  return {
    cards: interleaved,
    selectionMethod,
    tokenUsage: generationTokens,
    metrics,
  };
}

export function buildTypeData(card: RawCard): TypeData {
  switch (card.type) {
    case "insight":
      return { type: "insight" as const };
    case "quiz":
      return {
        type: "quiz" as const,
        variant: (card.variant ?? "multiple_choice") as "multiple_choice" | "true_false",
        question: card.question!,
        options: card.options!,
        correctIndex: card.correctIndex!,
        explanation: card.explanation!,
      };
    case "quote":
      return {
        type: "quote" as const,
        quotedText: card.quotedText!,
        ...(card.attribution ? { attribution: card.attribution } : {}),
      };
    case "summary":
      return {
        type: "summary" as const,
        bulletPoints: card.bulletPoints!,
      };
    case "connection":
      return {
        type: "connection" as const,
        sourceATitleHint: card.sourceATitleHint!,
        sourceBTitleHint: card.sourceBTitleHint!,
        sourceAKeyIdea: card.sourceAKeyIdea,
        sourceBKeyIdea: card.sourceBKeyIdea,
        similarityScore: card.similarityScore ?? 0,
        connectionType: card.connectionType ?? ("cross_document" as const),
      };
    default: {
      const _exhaustive: never = card.type;
      throw new Error(`Unknown card type: ${_exhaustive}`);
    }
  }
}
