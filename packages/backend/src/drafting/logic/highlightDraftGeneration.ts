import { ZERO_USAGE, addUsage, type TokenUsage } from "../../providers/llm/models";
import type {
  DraftCardType,
  HighlightDraftGenerationServiceContext,
  TypeData,
} from "../../providers/types";
import {
  castTypeData,
  computeQualityScore,
  selectRepresentativeChunks,
} from "./cardDraftGeneration";

const MIN_HIGHLIGHT_MATCH_LENGTH = 20;
const MIN_QUALITY_SCORE = 0.3;

/**
 * Highlight drafts bypass the LLM validator (they already carry a user-intent signal —
 * the user literally highlighted the passage — so running the validator would double
 * cost for marginal quality gain). To keep these drafts comparable with validated
 * section drafts at serving time, we populate `semanticQualityScore` with a capped
 * heuristic: the structural `qualityScore` ceilinged at 0.85. This prevents a
 * highlight draft from automatically outranking a top-tier validated section draft
 * while still placing highlights in the competitive band (ADR-018 §1, architect
 * review I1).
 */
const HIGHLIGHT_SEMANTIC_CEILING = 0.85;

export type HighlightData = {
  _id: string;
  text: string;
  pageNumber?: number;
};

export type SectionData = {
  _id: string;
  sectionTitle: string;
  summary: string;
  chunkStartIndex: number;
  chunkEndIndex: number;
};

export type ChunkData = {
  _id: string;
  content: string;
  chunkIndex: number;
};

export type HighlightDraftInput = {
  documentId: string;
  userId: string;
  documentTitle: string;
  language?: string;
  learningGoal?: string;
  highlights: HighlightData[];
  sections: SectionData[];
  allChunks: ChunkData[];
  existingHashes: ReadonlySet<string>;
  hashContent: (content: string) => string;
  generationBatch: number;
};

export type HighlightDraftRecord = {
  documentId: string;
  sectionSummaryId: string | undefined;
  userId: string;
  cardType: DraftCardType;
  content: string;
  typeData: TypeData;
  sourceChunkIds: string[];
  contentHash: string;
  qualityScore: number;
  semanticQualityScore: number;
  generationBatch: number;
  strategy: "highlight";
};

export type HighlightDraftMetrics = {
  highlightsInBatch: number;
  highlightsMatched: number;
  sectionsAffected: number;
  draftsProduced: number;
  draftsDeduplicated: number;
  draftsDiscardedLowQuality: number;
  draftsFailedLlm: number;
};

export type HighlightDraftResult = {
  drafts: HighlightDraftRecord[];
  processedHighlightIds: string[];
  tokenUsage: TokenUsage;
  metrics: HighlightDraftMetrics;
};

type SectionHighlightGroup = {
  section: SectionData;
  highlights: HighlightData[];
};

export function matchHighlightToSection(opts: {
  highlight: HighlightData;
  sections: SectionData[];
  allChunks: ChunkData[];
}): SectionData | undefined {
  const { highlight, sections, allChunks } = opts;
  const normalizedHighlight = highlight.text.toLowerCase().trim();

  if (normalizedHighlight.length < MIN_HIGHLIGHT_MATCH_LENGTH) return undefined;

  for (const chunk of allChunks) {
    const normalizedChunk = chunk.content.toLowerCase();
    if (!normalizedChunk.includes(normalizedHighlight)) continue;

    const matchedSection = sections.find(
      (s) => chunk.chunkIndex >= s.chunkStartIndex && chunk.chunkIndex <= s.chunkEndIndex,
    );
    if (matchedSection) return matchedSection;
  }

  return undefined;
}

export function groupHighlightsBySection(opts: {
  highlights: HighlightData[];
  sections: SectionData[];
  allChunks: ChunkData[];
}): { groups: SectionHighlightGroup[]; unmatchedIds: string[] } {
  const { highlights, sections, allChunks } = opts;
  const sectionMap = new Map<string, SectionHighlightGroup>();
  const unmatchedIds: string[] = [];

  for (const highlight of highlights) {
    const section = matchHighlightToSection({ highlight, sections, allChunks });
    if (!section) {
      unmatchedIds.push(highlight._id);
      continue;
    }

    const existing = sectionMap.get(section._id);
    if (existing) {
      existing.highlights.push(highlight);
    } else {
      sectionMap.set(section._id, { section, highlights: [highlight] });
    }
  }

  return { groups: Array.from(sectionMap.values()), unmatchedIds };
}

async function generateDraftsForSectionGroup(opts: {
  group: SectionHighlightGroup;
  input: HighlightDraftInput;
  services: HighlightDraftGenerationServiceContext;
  seenHashes: Set<string>;
}): Promise<{
  drafts: HighlightDraftRecord[];
  processedHighlightIds: string[];
  tokenUsage: TokenUsage;
  metrics: Pick<
    HighlightDraftMetrics,
    "draftsProduced" | "draftsDeduplicated" | "draftsDiscardedLowQuality" | "draftsFailedLlm"
  >;
}> {
  const { group, input, services, seenHashes } = opts;
  const emptyMetrics = {
    draftsProduced: 0,
    draftsDeduplicated: 0,
    draftsDiscardedLowQuality: 0,
    draftsFailedLlm: 0,
  };

  const representativeChunks = selectRepresentativeChunks({
    allChunks: input.allChunks,
    chunkStartIndex: group.section.chunkStartIndex,
    chunkEndIndex: group.section.chunkEndIndex,
  });

  const processedHighlightIds = group.highlights.map((h) => h._id);

  if (representativeChunks.length === 0) {
    return {
      drafts: [],
      processedHighlightIds,
      tokenUsage: ZERO_USAGE,
      metrics: emptyMetrics,
    };
  }

  const chunksForLlm = representativeChunks.map((c) => ({
    content: c.content,
    chunkId: c._id,
  }));

  const highlightsForLlm = group.highlights.map((h) => ({
    highlightId: h._id,
    highlightText: h.text,
  }));

  let result;
  try {
    result = await services.llm.generateDraftsFromHighlights({
      highlights: highlightsForLlm,
      sectionSummary: group.section.summary,
      sectionTitle: group.section.sectionTitle,
      chunks: chunksForLlm,
      documentTitle: input.documentTitle,
      language: input.language,
      learningGoal: input.learningGoal,
    });
  } catch {
    return {
      drafts: [],
      processedHighlightIds,
      tokenUsage: ZERO_USAGE,
      metrics: { ...emptyMetrics, draftsFailedLlm: group.highlights.length },
    };
  }

  const metrics = { ...emptyMetrics };
  const drafts: HighlightDraftRecord[] = [];
  const sourceChunkIds = representativeChunks.map((c) => c._id);

  for (const card of result.cards) {
    if (!card.content) continue;

    const contentHash = input.hashContent(card.content);
    if (seenHashes.has(contentHash)) {
      metrics.draftsDeduplicated++;
      continue;
    }

    const qualityScore = computeQualityScore({
      cardType: card.cardType,
      content: card.content,
      typeData: card.typeData,
      sourceChunkCount: representativeChunks.length,
    });

    if (qualityScore < MIN_QUALITY_SCORE) {
      metrics.draftsDiscardedLowQuality++;
      continue;
    }

    seenHashes.add(contentHash);
    drafts.push({
      documentId: input.documentId,
      sectionSummaryId: group.section._id,
      userId: input.userId,
      cardType: card.cardType,
      content: card.content,
      typeData: castTypeData(card.cardType, card.typeData),
      sourceChunkIds,
      contentHash,
      qualityScore,
      semanticQualityScore: Math.min(qualityScore, HIGHLIGHT_SEMANTIC_CEILING),
      generationBatch: input.generationBatch,
      strategy: "highlight",
    });
    metrics.draftsProduced++;
  }

  return {
    drafts,
    processedHighlightIds,
    tokenUsage: result.usage,
    metrics,
  };
}

export async function generateHighlightDrafts(opts: {
  input: HighlightDraftInput;
  services: HighlightDraftGenerationServiceContext;
}): Promise<HighlightDraftResult> {
  const { input, services } = opts;

  const metrics: HighlightDraftMetrics = {
    highlightsInBatch: input.highlights.length,
    highlightsMatched: 0,
    sectionsAffected: 0,
    draftsProduced: 0,
    draftsDeduplicated: 0,
    draftsDiscardedLowQuality: 0,
    draftsFailedLlm: 0,
  };

  if (input.highlights.length === 0) {
    return { drafts: [], processedHighlightIds: [], tokenUsage: ZERO_USAGE, metrics };
  }

  const { groups, unmatchedIds } = groupHighlightsBySection({
    highlights: input.highlights,
    sections: input.sections,
    allChunks: input.allChunks,
  });

  const matchedCount = input.highlights.length - unmatchedIds.length;
  metrics.highlightsMatched = matchedCount;
  metrics.sectionsAffected = groups.length;

  const seenHashes = new Set(input.existingHashes);
  const allDrafts: HighlightDraftRecord[] = [];
  const allProcessedIds: string[] = [...unmatchedIds];
  let totalUsage = ZERO_USAGE;

  for (const group of groups) {
    const groupResult = await generateDraftsForSectionGroup({
      group,
      input,
      services,
      seenHashes,
    });

    allDrafts.push(...groupResult.drafts);
    allProcessedIds.push(...groupResult.processedHighlightIds);
    totalUsage = addUsage(totalUsage, groupResult.tokenUsage);
    metrics.draftsProduced += groupResult.metrics.draftsProduced;
    metrics.draftsDeduplicated += groupResult.metrics.draftsDeduplicated;
    metrics.draftsDiscardedLowQuality += groupResult.metrics.draftsDiscardedLowQuality;
    metrics.draftsFailedLlm += groupResult.metrics.draftsFailedLlm;
  }

  return {
    drafts: allDrafts,
    processedHighlightIds: allProcessedIds,
    tokenUsage: totalUsage,
    metrics,
  };
}
