import type { ThematicDraftGenerationServiceContext, TokenUsage } from "../../providers/types";
import type { DraftCardType, TypeData } from "../../lib/validators";
import { castTypeData, computeQualityScore } from "./cardDraftGeneration";

const THEMATIC_CARD_TYPES: DraftCardType[] = ["insight", "summary"];
const MIN_QUALITY_SCORE = 0.3;
const THEME_CHUNKS_TOP_K = 3;

export type ThemeDiscoveryInput = {
  sectionSummaries: Array<{ sectionTitle: string; summary: string }>;
  documentTitle: string;
  language?: string;
};

export type Theme = {
  title: string;
  description: string;
  relevantSections: string[];
};

export type ThemeDiscoveryResult = {
  themes: Theme[];
  usage: TokenUsage;
};

export type ThematicDraftInput = {
  documentId: string;
  userId: string;
  documentTitle: string;
  language?: string;
  themes: Theme[];
  sectionSummaries: Array<{ sectionTitle: string; summary: string }>;
  chunkContentMap: ReadonlyMap<string, string>;
  existingHashes: ReadonlySet<string>;
  hashContent: (content: string) => string;
};

export type ThematicDraftRecord = {
  documentId: string;
  sectionSummaryId: undefined;
  userId: string;
  cardType: DraftCardType;
  content: string;
  typeData: TypeData;
  sourceChunkIds: string[];
  contentHash: string;
  qualityScore: number;
  generationBatch: number;
  strategy: "thematic";
};

export type ThematicDraftMetrics = {
  themesDiscovered: number;
  themesProcessed: number;
  themesFailed: number;
  draftsGenerated: number;
  draftsDeduplicated: number;
  draftsDiscardedLowQuality: number;
  draftsFailedLlm: number;
};

export type ThematicDraftResult = {
  drafts: ThematicDraftRecord[];
  tokenUsage: TokenUsage;
  metrics: ThematicDraftMetrics;
};

const ZERO_USAGE: TokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    totalTokens: a.totalTokens + b.totalTokens,
  };
}

export async function discoverThemes(opts: {
  input: ThemeDiscoveryInput;
  services: Pick<ThematicDraftGenerationServiceContext, "thematicLlm">;
}): Promise<ThemeDiscoveryResult> {
  const { input, services } = opts;
  const result = await services.thematicLlm.discoverThemes({
    sectionSummaries: input.sectionSummaries,
    documentTitle: input.documentTitle,
    language: input.language,
  });
  return { themes: result.themes, usage: result.usage };
}

function buildThemeSummary(opts: {
  theme: Theme;
  sectionSummaries: Array<{ sectionTitle: string; summary: string }>;
}): string {
  const { theme, sectionSummaries } = opts;
  const relevant = sectionSummaries.filter((s) => theme.relevantSections.includes(s.sectionTitle));
  const summaryText = relevant.map((s) => `"${s.sectionTitle}": ${s.summary}`).join("\n\n");
  return `Theme: ${theme.title}\n${theme.description}\n\nRelevant sections:\n${summaryText}`;
}

function resolveChunksFromSearch(opts: {
  searchResults: Array<{ payload: { chunkId: string } }>;
  chunkContentMap: ReadonlyMap<string, string>;
}): Array<{ content: string; chunkId: string }> {
  const { searchResults, chunkContentMap } = opts;
  return searchResults
    .map((r) => {
      const content = chunkContentMap.get(r.payload.chunkId);
      if (!content) return null;
      return { content, chunkId: r.payload.chunkId };
    })
    .filter((c): c is { content: string; chunkId: string } => c !== null);
}

async function generateDraftsForTheme(opts: {
  theme: Theme;
  input: ThematicDraftInput;
  services: ThematicDraftGenerationServiceContext;
  seenHashes: Set<string>;
}): Promise<{
  drafts: ThematicDraftRecord[];
  tokenUsage: TokenUsage;
  metrics: Pick<
    ThematicDraftMetrics,
    "draftsGenerated" | "draftsDeduplicated" | "draftsDiscardedLowQuality" | "draftsFailedLlm"
  >;
}> {
  const { theme, input, services, seenHashes } = opts;
  const emptyMetrics = {
    draftsGenerated: 0,
    draftsDeduplicated: 0,
    draftsDiscardedLowQuality: 0,
    draftsFailedLlm: 0,
  };

  const themeSummary = buildThemeSummary({
    theme,
    sectionSummaries: input.sectionSummaries,
  });

  const [themeEmbedding] = await services.embedder.embed([themeSummary]);
  if (!themeEmbedding) {
    return { drafts: [], tokenUsage: ZERO_USAGE, metrics: emptyMetrics };
  }

  const searchResults = await services.vectorStore.search(
    themeEmbedding,
    { userId: input.userId, documentId: input.documentId },
    THEME_CHUNKS_TOP_K,
  );

  if (searchResults.length === 0) {
    return { drafts: [], tokenUsage: ZERO_USAGE, metrics: emptyMetrics };
  }

  const chunks = resolveChunksFromSearch({
    searchResults,
    chunkContentMap: input.chunkContentMap,
  });

  if (chunks.length === 0) {
    return { drafts: [], tokenUsage: ZERO_USAGE, metrics: emptyMetrics };
  }

  const sourceChunkIds = chunks.map((c) => c.chunkId);

  const metrics = { ...emptyMetrics };
  const drafts: ThematicDraftRecord[] = [];
  let totalUsage = ZERO_USAGE;

  const settled = await Promise.allSettled(
    THEMATIC_CARD_TYPES.map((cardType) =>
      services.draftLlm
        .generateDraft({
          cardType,
          sectionSummary: themeSummary,
          sectionTitle: theme.title,
          chunks,
          documentTitle: input.documentTitle,
          language: input.language,
        })
        .then((result) => ({ cardType, ...result })),
    ),
  );

  for (const result of settled) {
    if (result.status === "rejected") {
      metrics.draftsFailedLlm++;
      continue;
    }

    const { cardType, card, usage } = result.value;
    totalUsage = addUsage(totalUsage, usage);

    if (!card.content) continue;

    const contentHash = input.hashContent(card.content);
    if (seenHashes.has(contentHash)) {
      metrics.draftsDeduplicated++;
      continue;
    }

    const qualityScore = computeQualityScore({
      cardType,
      content: card.content,
      typeData: card.typeData,
      sourceChunkCount: sourceChunkIds.length,
    });

    if (qualityScore < MIN_QUALITY_SCORE) {
      metrics.draftsDiscardedLowQuality++;
      continue;
    }

    seenHashes.add(contentHash);
    drafts.push({
      documentId: input.documentId,
      sectionSummaryId: undefined,
      userId: input.userId,
      cardType,
      content: card.content,
      typeData: castTypeData(cardType, card.typeData),
      sourceChunkIds,
      contentHash,
      qualityScore,
      generationBatch: 1,
      strategy: "thematic",
    });
    metrics.draftsGenerated++;
  }

  return { drafts, tokenUsage: totalUsage, metrics };
}

export async function generateThematicDrafts(opts: {
  input: ThematicDraftInput;
  services: ThematicDraftGenerationServiceContext;
}): Promise<ThematicDraftResult> {
  const { input, services } = opts;

  const metrics: ThematicDraftMetrics = {
    themesDiscovered: input.themes.length,
    themesProcessed: 0,
    themesFailed: 0,
    draftsGenerated: 0,
    draftsDeduplicated: 0,
    draftsDiscardedLowQuality: 0,
    draftsFailedLlm: 0,
  };

  if (input.themes.length === 0) {
    return { drafts: [], tokenUsage: ZERO_USAGE, metrics };
  }

  const seenHashes = new Set(input.existingHashes);
  const allDrafts: ThematicDraftRecord[] = [];
  let totalUsage = ZERO_USAGE;

  const settled = await Promise.allSettled(
    input.themes.map((theme) => generateDraftsForTheme({ theme, input, services, seenHashes })),
  );

  for (const result of settled) {
    if (result.status === "rejected") {
      metrics.themesFailed++;
      continue;
    }

    metrics.themesProcessed++;
    const themeResult = result.value;
    allDrafts.push(...themeResult.drafts);
    totalUsage = addUsage(totalUsage, themeResult.tokenUsage);
    metrics.draftsGenerated += themeResult.metrics.draftsGenerated;
    metrics.draftsDeduplicated += themeResult.metrics.draftsDeduplicated;
    metrics.draftsDiscardedLowQuality += themeResult.metrics.draftsDiscardedLowQuality;
    metrics.draftsFailedLlm += themeResult.metrics.draftsFailedLlm;
  }

  return { drafts: allDrafts, tokenUsage: totalUsage, metrics };
}
