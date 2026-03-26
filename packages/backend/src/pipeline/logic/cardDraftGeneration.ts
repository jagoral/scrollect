import type {
  DraftCardType,
  DraftGenerationServiceContext,
  TokenUsage,
  TypeData,
} from "../../providers/types";

const DRAFT_CARD_TYPES: DraftCardType[] = ["insight", "quiz", "quote", "summary"];
const MIN_QUALITY_SCORE = 0.3;

export type SectionInput = {
  sectionSummaryId: string;
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

export type GenerateDraftsInput = {
  documentId: string;
  userId: string;
  documentTitle: string;
  language?: string;
  fileType?: string;
  section: SectionInput;
  allChunks: ChunkData[];
  existingHashes: ReadonlySet<string>;
  hashContent: (content: string) => string;
};

export type DraftRecord = {
  documentId: string;
  sectionSummaryId: string;
  userId: string;
  cardType: DraftCardType;
  content: string;
  typeData: TypeData;
  sourceChunkIds: string[];
  contentHash: string;
  qualityScore: number;
  generationBatch: number;
  strategy: "section";
};

export type ValidationRejection = {
  cardType: DraftCardType;
  reason: string;
};

export type GenerateDraftsMetrics = {
  sectionTitle: string;
  cardTypesAttempted: number;
  draftsGenerated: number;
  draftsDeduplicated: number;
  draftsDiscardedLowQuality: number;
  draftsFailedLlm: number;
  draftsRejectedValidation: number;
  draftsValidatorErrored: number;
  validationRejections: ValidationRejection[];
};

export type GenerateDraftsResult = {
  drafts: DraftRecord[];
  tokenUsage: TokenUsage;
  metrics: GenerateDraftsMetrics;
};

export function selectRepresentativeChunks(opts: {
  allChunks: ChunkData[];
  chunkStartIndex: number;
  chunkEndIndex: number;
}): ChunkData[] {
  const { allChunks, chunkStartIndex, chunkEndIndex } = opts;
  const sectionChunks = allChunks.filter(
    (c) => c.chunkIndex >= chunkStartIndex && c.chunkIndex <= chunkEndIndex,
  );

  if (sectionChunks.length === 0) return [];
  if (sectionChunks.length <= 2) return sectionChunks;

  const first = sectionChunks[0]!;
  const last = sectionChunks[sectionChunks.length - 1]!;

  if (sectionChunks.length >= 5) {
    const midIdx = Math.floor(sectionChunks.length / 2);
    return [first, sectionChunks[midIdx]!, last];
  }

  return [first, last];
}

export function computeQualityScore(opts: {
  cardType: DraftCardType;
  content: string;
  typeData: Record<string, unknown>;
  sourceChunkCount: number;
}): number {
  const { cardType, content, typeData, sourceChunkCount } = opts;

  const structuralScore = computeStructuralScore({ cardType, typeData });
  const lengthScore = computeLengthScore(content);
  const coverageScore = computeCoverageScore({ cardType, sourceChunkCount });

  return structuralScore * 0.4 + lengthScore * 0.3 + coverageScore * 0.3;
}

export function computeStructuralScore(opts: {
  cardType: DraftCardType;
  typeData: Record<string, unknown>;
}): number {
  const { cardType, typeData } = opts;
  switch (cardType) {
    case "insight":
      return 1.0;
    case "quiz": {
      const hasQuestion = typeof typeData.question === "string" && typeData.question.length > 0;
      const hasOptions = Array.isArray(typeData.options) && typeData.options.length >= 2;
      const hasCorrectIndex =
        typeof typeData.correctIndex === "number" &&
        typeData.correctIndex >= 0 &&
        typeData.correctIndex < (Array.isArray(typeData.options) ? typeData.options.length : 0);
      const hasExplanation =
        typeof typeData.explanation === "string" && typeData.explanation.length > 0;
      return hasQuestion && hasOptions && hasCorrectIndex && hasExplanation ? 1.0 : 0.0;
    }
    case "quote":
      return typeof typeData.quotedText === "string" && typeData.quotedText.length > 0 ? 1.0 : 0.0;
    case "summary":
      return Array.isArray(typeData.bulletPoints) && typeData.bulletPoints.length >= 2 ? 1.0 : 0.0;
    default:
      return 0.0;
  }
}

function computeLengthScore(content: string): number {
  const len = content.length;
  if (len < 50) return 0.0;
  if (len < 100) return 0.5;
  return 1.0;
}

function computeCoverageScore(opts: { cardType: DraftCardType; sourceChunkCount: number }): number {
  if (opts.cardType === "quote") return 1.0;
  return opts.sourceChunkCount >= 2 ? 1.0 : 0.5;
}

function assertString(value: unknown, field: string): string {
  if (typeof value !== "string")
    throw new Error(`Expected string for ${field}, got ${typeof value}`);
  return value;
}

function assertNumber(value: unknown, field: string): number {
  if (typeof value !== "number")
    throw new Error(`Expected number for ${field}, got ${typeof value}`);
  return value;
}

function assertStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) throw new Error(`Expected array for ${field}, got ${typeof value}`);
  return value.map((item, i) => assertString(item, `${field}[${i}]`));
}

export function castTypeData(cardType: DraftCardType, raw: Record<string, unknown>): TypeData {
  switch (cardType) {
    case "insight":
      return { type: "insight" as const };
    case "quiz": {
      const variant = assertString(raw.variant, "variant");
      if (variant !== "multiple_choice" && variant !== "true_false") {
        throw new Error(`Invalid quiz variant: ${variant}`);
      }
      return {
        type: "quiz" as const,
        variant,
        question: assertString(raw.question, "question"),
        options: assertStringArray(raw.options, "options"),
        correctIndex: assertNumber(raw.correctIndex, "correctIndex"),
        explanation: assertString(raw.explanation, "explanation"),
      };
    }
    case "quote":
      return {
        type: "quote" as const,
        quotedText: assertString(raw.quotedText, "quotedText"),
        ...(raw.attribution ? { attribution: assertString(raw.attribution, "attribution") } : {}),
      };
    case "summary":
      return {
        type: "summary" as const,
        bulletPoints: assertStringArray(raw.bulletPoints, "bulletPoints"),
      };
  }
}

const ZERO_USAGE: TokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    totalTokens: a.totalTokens + b.totalTokens,
  };
}

export async function generateDraftsForSection(opts: {
  input: GenerateDraftsInput;
  services: DraftGenerationServiceContext;
}): Promise<GenerateDraftsResult> {
  const { input, services } = opts;
  const { documentId, userId, documentTitle, section, allChunks, existingHashes, hashContent } =
    input;

  const representativeChunks = selectRepresentativeChunks({
    allChunks,
    chunkStartIndex: section.chunkStartIndex,
    chunkEndIndex: section.chunkEndIndex,
  });

  const metrics: GenerateDraftsMetrics = {
    sectionTitle: section.sectionTitle,
    cardTypesAttempted: DRAFT_CARD_TYPES.length,
    draftsGenerated: 0,
    draftsDeduplicated: 0,
    draftsDiscardedLowQuality: 0,
    draftsFailedLlm: 0,
    draftsRejectedValidation: 0,
    draftsValidatorErrored: 0,
    validationRejections: [],
  };

  if (representativeChunks.length === 0) {
    return { drafts: [], tokenUsage: ZERO_USAGE, metrics };
  }

  const chunksForLlm = representativeChunks.map((c) => ({
    content: c.content,
    chunkId: c._id,
  }));

  const drafts: DraftRecord[] = [];
  let totalUsage = ZERO_USAGE;
  const seenHashes = new Set(existingHashes);

  const settled = await Promise.allSettled(
    DRAFT_CARD_TYPES.map((cardType) =>
      services.llm
        .generateDraft({
          cardType,
          sectionSummary: section.summary,
          sectionTitle: section.sectionTitle,
          chunks: chunksForLlm,
          documentTitle,
          language: input.language,
          fileType: input.fileType,
        })
        .then((result) => ({ cardType, ...result })),
    ),
  );

  const candidates: DraftRecord[] = [];

  for (const result of settled) {
    if (result.status === "rejected") {
      metrics.draftsFailedLlm++;
      continue;
    }

    const { cardType, card, usage } = result.value;
    totalUsage = addUsage(totalUsage, usage);

    if (!card.content) continue;

    const contentHash = hashContent(card.content);
    if (seenHashes.has(contentHash)) {
      metrics.draftsDeduplicated++;
      continue;
    }

    const qualityScore = computeQualityScore({
      cardType,
      content: card.content,
      typeData: card.typeData,
      sourceChunkCount: representativeChunks.length,
    });

    if (qualityScore < MIN_QUALITY_SCORE) {
      metrics.draftsDiscardedLowQuality++;
      continue;
    }

    seenHashes.add(contentHash);
    candidates.push({
      documentId,
      sectionSummaryId: section.sectionSummaryId,
      userId,
      cardType,
      content: card.content,
      typeData: castTypeData(cardType, card.typeData),
      sourceChunkIds: representativeChunks.map((c) => c._id),
      contentHash,
      qualityScore,
      generationBatch: 1,
      strategy: "section",
    });
  }

  if (services.validator && candidates.length > 0) {
    const validationResults = await Promise.allSettled(
      candidates.map((candidate) =>
        services.validator!.validateDraft({
          cardType: candidate.cardType,
          content: candidate.content,
          typeData: candidate.typeData as Record<string, unknown>,
          sectionTitle: section.sectionTitle,
          documentTitle,
        }),
      ),
    );

    for (let i = 0; i < candidates.length; i++) {
      const vResult = validationResults[i]!;
      if (vResult.status === "rejected") {
        metrics.draftsValidatorErrored++;
        drafts.push(candidates[i]!);
        metrics.draftsGenerated++;
        continue;
      }

      totalUsage = addUsage(totalUsage, vResult.value.usage);
      if (!vResult.value.isValid) {
        metrics.draftsRejectedValidation++;
        metrics.validationRejections.push({
          cardType: candidates[i]!.cardType,
          reason: vResult.value.rejectionReason ?? "Unknown",
        });
        continue;
      }

      drafts.push(candidates[i]!);
      metrics.draftsGenerated++;
    }
  } else {
    for (const candidate of candidates) {
      drafts.push(candidate);
      metrics.draftsGenerated++;
    }
  }

  return { drafts, tokenUsage: totalUsage, metrics };
}
