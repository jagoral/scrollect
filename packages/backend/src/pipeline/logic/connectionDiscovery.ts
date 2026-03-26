import { groupBy } from "es-toolkit";

import type { ConnectionDiscoveryServiceContext, TokenUsage } from "../../providers/types";

const SIMILARITY_THRESHOLD = 0.75;
const SEARCH_TOP_K = 5;
const MAX_CHUNKS_PER_SECTION = 3;

export type SectionData = {
  sectionSummaryId: string;
  documentId: string;
  sectionTitle: string;
  summary: string;
  embeddingId: string;
  chunkStartIndex: number;
  chunkEndIndex: number;
};

export type ChunkData = {
  _id: string;
  content: string;
  chunkIndex: number;
  documentId: string;
};

export type DocumentData = {
  documentId: string;
  title: string;
};

export type ConnectionDiscoveryInput = {
  userId: string;
  language?: string;
  newDocument: DocumentData;
  newDocumentSections: SectionData[];
  allDocuments: Map<string, DocumentData>;
  allSections: Map<string, SectionData>;
  allChunks: ChunkData[];
  sectionEmbeddings: Map<string, number[]>;
  existingPairKeys: ReadonlySet<string>;
  hashContent: (content: string) => string;
  existingDraftHashes: ReadonlySet<string>;
};

export type ConnectionPairRecord = {
  userId: string;
  sectionSummaryIdA: string;
  sectionSummaryIdB: string;
  documentIdA: string;
  documentIdB: string;
  similarityScore: number;
  connectionType: "cross_document" | "within_document";
  status: "pending" | "drafted" | "failed";
};

export type ConnectionDraftRecord = {
  documentId: string;
  sectionSummaryId: string;
  userId: string;
  cardType: "connection";
  content: string;
  typeData: {
    type: "connection";
    sourceATitleHint: string;
    sourceBTitleHint: string;
    sourceAKeyIdea?: string;
    sourceBKeyIdea?: string;
    similarityScore?: number;
    connectionType?: "cross_document" | "within_document";
  };
  sourceChunkIds: string[];
  contentHash: string;
  qualityScore: number;
  generationBatch: number;
  strategy: "connection";
};

export type ConnectionDiscoveryMetrics = {
  sectionsSearched: number;
  candidatePairsFound: number;
  pairsDeduplicatedByKey: number;
  pairsBelowThreshold: number;
  pairsProcessed: number;
  pairsRejectedByLlm: number;
  pairsFailedLlm: number;
  draftsGenerated: number;
  draftsDeduplicated: number;
  withinDocumentFallback: boolean;
};

export type ConnectionDiscoveryResult = {
  pairs: ConnectionPairRecord[];
  drafts: ConnectionDraftRecord[];
  tokenUsage: TokenUsage;
  metrics: ConnectionDiscoveryMetrics;
};

const ZERO_USAGE: TokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    totalTokens: a.totalTokens + b.totalTokens,
  };
}

export function buildPairKey(idA: string, idB: string): string {
  return idA < idB ? `${idA}:${idB}` : `${idB}:${idA}`;
}

export function orderPair(idA: string, idB: string): [string, string] {
  return idA < idB ? [idA, idB] : [idB, idA];
}

type CandidatePair = {
  sectionSummaryIdA: string;
  sectionSummaryIdB: string;
  documentIdA: string;
  documentIdB: string;
  similarityScore: number;
  connectionType: "cross_document" | "within_document";
};

function selectChunksForSection(opts: {
  section: SectionData;
  chunksByDocumentId: Record<string, ChunkData[]>;
}): Array<{ content: string; chunkId: string }> {
  const { section, chunksByDocumentId } = opts;
  const docChunks = chunksByDocumentId[section.documentId] ?? [];
  const sectionChunks = docChunks.filter(
    (c) => c.chunkIndex >= section.chunkStartIndex && c.chunkIndex <= section.chunkEndIndex,
  );

  if (sectionChunks.length <= MAX_CHUNKS_PER_SECTION) {
    return sectionChunks.map((c) => ({ content: c.content, chunkId: c._id }));
  }

  const first = sectionChunks[0]!;
  const last = sectionChunks[sectionChunks.length - 1]!;
  const midIdx = Math.floor(sectionChunks.length / 2);
  return [first, sectionChunks[midIdx]!, last].map((c) => ({
    content: c.content,
    chunkId: c._id,
  }));
}

export async function discoverConnections(opts: {
  input: ConnectionDiscoveryInput;
  services: ConnectionDiscoveryServiceContext;
}): Promise<ConnectionDiscoveryResult> {
  const { input, services } = opts;

  const metrics: ConnectionDiscoveryMetrics = {
    sectionsSearched: 0,
    candidatePairsFound: 0,
    pairsDeduplicatedByKey: 0,
    pairsBelowThreshold: 0,
    pairsProcessed: 0,
    pairsRejectedByLlm: 0,
    pairsFailedLlm: 0,
    draftsGenerated: 0,
    draftsDeduplicated: 0,
    withinDocumentFallback: false,
  };

  if (input.newDocumentSections.length === 0) {
    return { pairs: [], drafts: [], tokenUsage: ZERO_USAGE, metrics };
  }

  const chunksByDocumentId = groupBy(input.allChunks, (c) => c.documentId);

  const crossDocCandidates = await findCrossDocumentCandidates({
    input,
    services,
    metrics,
  });

  let candidates = crossDocCandidates;

  if (crossDocCandidates.length === 0 && input.newDocumentSections.length >= 2) {
    metrics.withinDocumentFallback = true;
    candidates = await findWithinDocumentCandidates({
      input,
      services,
      metrics,
    });
  }

  if (candidates.length === 0) {
    return { pairs: [], drafts: [], tokenUsage: ZERO_USAGE, metrics };
  }

  return generateDraftsForCandidates({ input, services, candidates, metrics, chunksByDocumentId });
}

async function findCrossDocumentCandidates(opts: {
  input: ConnectionDiscoveryInput;
  services: ConnectionDiscoveryServiceContext;
  metrics: ConnectionDiscoveryMetrics;
}): Promise<CandidatePair[]> {
  const { input, services, metrics } = opts;
  const seenKeys = new Set(input.existingPairKeys);
  const candidates: CandidatePair[] = [];

  for (const section of input.newDocumentSections) {
    const embedding = input.sectionEmbeddings.get(section.sectionSummaryId);
    if (!embedding) continue;

    metrics.sectionsSearched++;

    const results = await services.summaryStore.search(
      embedding,
      { userId: input.userId, summaryType: "section" },
      SEARCH_TOP_K,
    );

    for (const result of results) {
      if (result.payload.documentId === input.newDocument.documentId) continue;

      const matchedSectionId = findSectionIdByPayload({
        allSections: input.allSections,
        qdrantPointId: result.id,
      });
      if (!matchedSectionId) continue;

      if (result.score < SIMILARITY_THRESHOLD) {
        metrics.pairsBelowThreshold++;
        continue;
      }

      const pairKey = buildPairKey(section.sectionSummaryId, matchedSectionId);
      if (seenKeys.has(pairKey)) {
        metrics.pairsDeduplicatedByKey++;
        continue;
      }

      seenKeys.add(pairKey);
      candidates.push({
        ...orderPairRecord({
          sectionIdA: section.sectionSummaryId,
          sectionIdB: matchedSectionId,
          docIdA: section.documentId,
          docIdB: result.payload.documentId,
        }),
        similarityScore: result.score,
        connectionType: "cross_document",
      });
      metrics.candidatePairsFound++;
    }
  }

  return candidates;
}

async function findWithinDocumentCandidates(opts: {
  input: ConnectionDiscoveryInput;
  services: ConnectionDiscoveryServiceContext;
  metrics: ConnectionDiscoveryMetrics;
}): Promise<CandidatePair[]> {
  const { input, services, metrics } = opts;
  const seenKeys = new Set(input.existingPairKeys);
  const candidates: CandidatePair[] = [];

  for (const section of input.newDocumentSections) {
    const embedding = input.sectionEmbeddings.get(section.sectionSummaryId);
    if (!embedding) continue;

    metrics.sectionsSearched++;

    const results = await services.summaryStore.search(
      embedding,
      {
        userId: input.userId,
        summaryType: "section",
        documentIds: [input.newDocument.documentId],
      },
      SEARCH_TOP_K,
    );

    for (const result of results) {
      const matchedSectionId = findSectionIdByPayload({
        allSections: input.allSections,
        qdrantPointId: result.id,
      });
      if (!matchedSectionId) continue;
      if (matchedSectionId === section.sectionSummaryId) continue;

      if (result.score < SIMILARITY_THRESHOLD) {
        metrics.pairsBelowThreshold++;
        continue;
      }

      const pairKey = buildPairKey(section.sectionSummaryId, matchedSectionId);
      if (seenKeys.has(pairKey)) {
        metrics.pairsDeduplicatedByKey++;
        continue;
      }

      seenKeys.add(pairKey);
      candidates.push({
        ...orderPairRecord({
          sectionIdA: section.sectionSummaryId,
          sectionIdB: matchedSectionId,
          docIdA: section.documentId,
          docIdB: result.payload.documentId,
        }),
        similarityScore: result.score,
        connectionType: "within_document",
      });
      metrics.candidatePairsFound++;
    }
  }

  return candidates;
}

function findSectionIdByPayload(opts: {
  allSections: Map<string, SectionData>;
  qdrantPointId: string;
}): string | undefined {
  for (const [id, section] of opts.allSections) {
    if (section.embeddingId === opts.qdrantPointId) return id;
  }
  return undefined;
}

function orderPairRecord(opts: {
  sectionIdA: string;
  sectionIdB: string;
  docIdA: string;
  docIdB: string;
}): {
  sectionSummaryIdA: string;
  sectionSummaryIdB: string;
  documentIdA: string;
  documentIdB: string;
} {
  const [orderedA, orderedB] = orderPair(opts.sectionIdA, opts.sectionIdB);
  const isSwapped = orderedA !== opts.sectionIdA;
  return {
    sectionSummaryIdA: orderedA,
    sectionSummaryIdB: orderedB,
    documentIdA: isSwapped ? opts.docIdB : opts.docIdA,
    documentIdB: isSwapped ? opts.docIdA : opts.docIdB,
  };
}

async function generateDraftsForCandidates(opts: {
  input: ConnectionDiscoveryInput;
  services: ConnectionDiscoveryServiceContext;
  candidates: CandidatePair[];
  metrics: ConnectionDiscoveryMetrics;
  chunksByDocumentId: Record<string, ChunkData[]>;
}): Promise<ConnectionDiscoveryResult> {
  const { input, services, candidates, metrics, chunksByDocumentId } = opts;
  const pairs: ConnectionPairRecord[] = [];
  const drafts: ConnectionDraftRecord[] = [];
  let totalUsage = ZERO_USAGE;
  const seenDraftHashes = new Set(input.existingDraftHashes);

  const settled = await Promise.allSettled(
    candidates.map((candidate) =>
      generateDraftForCandidate({ input, services, candidate, chunksByDocumentId }).then(
        (result) => ({
          candidate,
          ...result,
        }),
      ),
    ),
  );

  for (const result of settled) {
    if (result.status === "rejected") {
      metrics.pairsFailedLlm++;
      const failedCandidate = candidates[settled.indexOf(result)];
      if (failedCandidate) {
        pairs.push({
          userId: input.userId,
          ...failedCandidate,
          status: "failed",
        });
      }
      continue;
    }

    const { candidate, card, usage } = result.value;
    totalUsage = addUsage(totalUsage, usage);
    metrics.pairsProcessed++;

    if (!card) {
      metrics.pairsRejectedByLlm++;
      pairs.push({
        userId: input.userId,
        ...candidate,
        status: "failed",
      });
      continue;
    }

    pairs.push({
      userId: input.userId,
      ...candidate,
      status: "drafted",
    });

    const contentHash = input.hashContent(card.content);
    if (seenDraftHashes.has(contentHash)) {
      metrics.draftsDeduplicated++;
      continue;
    }
    seenDraftHashes.add(contentHash);

    const sourceChunkIds = collectSourceChunkIds({
      input,
      sectionSummaryIdA: candidate.sectionSummaryIdA,
      sectionSummaryIdB: candidate.sectionSummaryIdB,
      chunksByDocumentId,
    });

    drafts.push({
      documentId: input.newDocument.documentId,
      sectionSummaryId: candidate.sectionSummaryIdA,
      userId: input.userId,
      cardType: "connection",
      content: card.content,
      typeData: {
        ...card.typeData,
        type: "connection",
        similarityScore: candidate.similarityScore,
        connectionType: candidate.connectionType,
      } as ConnectionDraftRecord["typeData"],
      sourceChunkIds,
      contentHash,
      qualityScore: candidate.similarityScore,
      generationBatch: 1,
      strategy: "connection",
    });
    metrics.draftsGenerated++;
  }

  return { pairs, drafts, tokenUsage: totalUsage, metrics };
}

async function generateDraftForCandidate(opts: {
  input: ConnectionDiscoveryInput;
  services: ConnectionDiscoveryServiceContext;
  candidate: CandidatePair;
  chunksByDocumentId: Record<string, ChunkData[]>;
}): Promise<{
  card: { content: string; typeData: Record<string, unknown> } | null;
  usage: TokenUsage;
}> {
  const { input, services, candidate, chunksByDocumentId } = opts;

  const sectionA = input.allSections.get(candidate.sectionSummaryIdA);
  const sectionB = input.allSections.get(candidate.sectionSummaryIdB);
  if (!sectionA || !sectionB) {
    return { card: null, usage: ZERO_USAGE };
  }

  const docA = input.allDocuments.get(sectionA.documentId);
  const docB = input.allDocuments.get(sectionB.documentId);
  if (!docA || !docB) {
    return { card: null, usage: ZERO_USAGE };
  }

  const chunksA = selectChunksForSection({ section: sectionA, chunksByDocumentId });
  const chunksB = selectChunksForSection({ section: sectionB, chunksByDocumentId });

  return services.llm.generateConnectionDraft({
    sectionA: { title: sectionA.sectionTitle, summary: sectionA.summary, chunks: chunksA },
    sectionB: { title: sectionB.sectionTitle, summary: sectionB.summary, chunks: chunksB },
    documentATitle: docA.title,
    documentBTitle: docB.title,
    language: input.language,
  });
}

function collectSourceChunkIds(opts: {
  input: ConnectionDiscoveryInput;
  sectionSummaryIdA: string;
  sectionSummaryIdB: string;
  chunksByDocumentId: Record<string, ChunkData[]>;
}): string[] {
  const { input, sectionSummaryIdA, sectionSummaryIdB, chunksByDocumentId } = opts;
  const sectionA = input.allSections.get(sectionSummaryIdA);
  const sectionB = input.allSections.get(sectionSummaryIdB);
  const chunkIds: string[] = [];

  if (sectionA) {
    const chunks = selectChunksForSection({ section: sectionA, chunksByDocumentId });
    chunkIds.push(...chunks.map((c) => c.chunkId));
  }
  if (sectionB) {
    const chunks = selectChunksForSection({ section: sectionB, chunksByDocumentId });
    chunkIds.push(...chunks.map((c) => c.chunkId));
  }

  return chunkIds;
}
