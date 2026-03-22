import type { ConnectionPair } from "./discovery";
import { discoverConnections } from "./discovery";
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
  summary?: string;
  summaryEmbeddingId?: string;
  learningGoal?: string;
};

export type FeedInputData = {
  documents: DocumentInfo[];
  allChunks: ChunkMetadata[];
  recentSources: PostSourceRecord[];
  recentPosts: { _id: string; postType: string }[];
  recentHashes: ReadonlySet<string>;
  sectionSummaries: SectionSummaryInfo[];
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
  const { documents, allChunks, recentSources, recentPosts, sectionSummaries, userId, now } = data;
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

  const typeCoverageHint = buildTypeCoverageHint(chunkUsageMap);
  const systemPrompt = buildMultiTypePrompt(hydratedChunks.length, cardCount) + typeCoverageHint;

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

  const userPrompt =
    summaryContext +
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

function buildMultiTypePrompt(chunkCount: number, cardCount: number): string {
  return `You are an AI learning assistant for Scrollect, a personal learning feed app.
Your job is to transform raw text chunks from documents into engaging, bite-sized learning cards of MIXED types.

Card types you MUST produce (aim for variety - use at least 3 different types):

1. **insight** - A concise insight or key takeaway (2-4 sentences). Use **bold** for key terms.
2. **quiz** - A question testing understanding. Include:
   - variant: "multiple_choice" or "true_false"
   - question: the question text
   - options: array of 4 choices (or 2 for true_false: ["True", "False"])
   - correctIndex: 0-based index of the correct option
   - explanation: brief explanation of the correct answer
3. **quote** - A notable quote from the source. Include:
   - quotedText: the exact quoted text
   - attribution: (optional) author or source name
4. **summary** - A bullet-point summary combining ideas from MULTIPLE chunks. Include:
   - bulletPoints: array of 2-5 bullet point strings
   - IMPORTANT: summaries MUST reference at least 2 different chunks via sourceChunkIndices
5. **connection** - Links concepts across different sources. Include:
   - sourceATitleHint: title/topic of the first source
   - sourceBTitleHint: title/topic of the second source
   - sourceAKeyIdea: one sentence describing the key idea from the first source that forms the connection
   - sourceBKeyIdea: one sentence describing the key idea from the second source that forms the connection
   - IMPORTANT: connections MUST reference at least 2 chunks via sourceChunkIndices
   - QUALITY GATE: Only create a connection if the relationship is genuinely insightful and non-obvious. If two chunks merely discuss the same topic without a deeper conceptual bridge, do NOT create a connection card - use a different type instead.

For ALL cards:
- content: 2-4 sentences of engaging text (the main card body)
- sourceChunkIndices: array of 0-based indices into the provided chunks that this card draws from

Return a JSON object: { "cards": [ { type, content, sourceChunkIndices, ...type-specific fields } ] }

Produce exactly ${cardCount} cards from the ${chunkCount} chunks provided. Ensure variety in types.`;
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
