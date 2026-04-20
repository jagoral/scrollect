import { ZERO_USAGE, addUsage, type TokenUsage } from "../../providers/llm/models";
import type { DraftPostType, DraftGenerationServiceContext, TypeData } from "../../providers/types";

export const DRAFT_POST_TYPES: DraftPostType[] = ["insight", "quiz", "quote", "summary"];
const MIN_QUALITY_SCORE = 0.3;
type ContextDepth = "representative" | "full";

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
  learningGoal?: string;
  section: SectionInput;
  /**
   * Section-level quality signal from the #215 ranker, copied onto each draft so the
   * serving scorer can read it without joining to `sectionSummaries`. Missing for
   * highlight/thematic generation or when the ranker didn't score this section - the
   * serving scorer falls back to `qualityScore` in that case.
   */
  sectionQualitySignal?: number;
  allChunks: ChunkData[];
  postTypes?: DraftPostType[];
  generationBatch?: number;
  contextDepth?: ContextDepth;
  existingHashes: ReadonlySet<string>;
  hashContent: (content: string) => string;
};

export type DraftRecord = {
  documentId: string;
  sectionSummaryId: string;
  userId: string;
  postType: DraftPostType;
  content: string;
  typeData: TypeData;
  sourceChunkIds: string[];
  contentHash: string;
  qualityScore: number;
  /** Semantic learning-value score from the validator LLM. Optional - falls back at serve time. */
  semanticQualityScore?: number;
  /** Section-level quality signal from the #215 ranker, copied for serve-time use. Optional. */
  sectionQualitySignal?: number;
  generationBatch: number;
  strategy: "section";
};

export type ValidationRejection = {
  postType: DraftPostType;
  reason: string;
};

export type GenerateDraftsMetrics = {
  sectionTitle: string;
  postTypesAttempted: number;
  draftsGenerated: number;
  draftsDeduplicated: number;
  draftsDiscardedLowQuality: number;
  draftsFailedLlm: number;
  draftsSkippedNoQuote: number;
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

export function selectSectionChunks(opts: {
  allChunks: ChunkData[];
  chunkStartIndex: number;
  chunkEndIndex: number;
}): ChunkData[] {
  return opts.allChunks.filter(
    (c) => c.chunkIndex >= opts.chunkStartIndex && c.chunkIndex <= opts.chunkEndIndex,
  );
}

const CHUNK_SELECTION_STRATEGIES = {
  representative: selectRepresentativeChunks,
  full: selectSectionChunks,
} satisfies Record<
  ContextDepth,
  (opts: { allChunks: ChunkData[]; chunkStartIndex: number; chunkEndIndex: number }) => ChunkData[]
>;

export function computeQualityScore(opts: {
  postType: DraftPostType;
  content: string;
  typeData: Record<string, unknown>;
  sourceChunkCount: number;
}): number {
  const { postType, content, typeData, sourceChunkCount } = opts;

  const structuralScore = computeStructuralScore({ postType, typeData });
  const lengthScore = computeLengthScore(content);
  const coverageScore = computeCoverageScore({ postType, sourceChunkCount });

  return structuralScore * 0.4 + lengthScore * 0.3 + coverageScore * 0.3;
}

export function computeStructuralScore(opts: {
  postType: DraftPostType;
  typeData: Record<string, unknown>;
}): number {
  const { postType, typeData } = opts;
  switch (postType) {
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

function computeCoverageScore(opts: { postType: DraftPostType; sourceChunkCount: number }): number {
  if (opts.postType === "quote") return 1.0;
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

export function castTypeData(postType: DraftPostType, raw: Record<string, unknown>): TypeData {
  switch (postType) {
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

export async function generateDraftsForSection(opts: {
  input: GenerateDraftsInput;
  services: DraftGenerationServiceContext;
}): Promise<GenerateDraftsResult> {
  const { input, services } = opts;
  const { documentId, userId, documentTitle, section, allChunks, existingHashes, hashContent } =
    input;

  const sourceChunks = CHUNK_SELECTION_STRATEGIES[input.contextDepth ?? "representative"]({
    allChunks,
    chunkStartIndex: section.chunkStartIndex,
    chunkEndIndex: section.chunkEndIndex,
  });
  const postTypes = input.postTypes ?? DRAFT_POST_TYPES;

  const metrics: GenerateDraftsMetrics = {
    sectionTitle: section.sectionTitle,
    postTypesAttempted: postTypes.length,
    draftsGenerated: 0,
    draftsDeduplicated: 0,
    draftsDiscardedLowQuality: 0,
    draftsFailedLlm: 0,
    draftsSkippedNoQuote: 0,
    draftsRejectedValidation: 0,
    draftsValidatorErrored: 0,
    validationRejections: [],
  };

  if (sourceChunks.length === 0 || postTypes.length === 0) {
    return { drafts: [], tokenUsage: ZERO_USAGE, metrics };
  }

  const chunksForLlm = sourceChunks.map((c) => ({
    content: c.content,
    chunkId: c._id,
  }));

  const drafts: DraftRecord[] = [];
  let totalUsage = ZERO_USAGE;
  const seenHashes = new Set(existingHashes);

  const settled = await Promise.allSettled(
    postTypes.map((postType) =>
      services.llm
        .generateDraft({
          postType,
          sectionSummary: section.summary,
          sectionTitle: section.sectionTitle,
          chunks: chunksForLlm,
          documentTitle,
          language: input.language,
          fileType: input.fileType,
          learningGoal: input.learningGoal,
        })
        .then((result) => ({ postType, ...result })),
    ),
  );

  const candidates: DraftRecord[] = [];

  for (const result of settled) {
    if (result.status === "rejected") {
      metrics.draftsFailedLlm++;
      continue;
    }

    const { postType, draft, usage } = result.value;
    totalUsage = addUsage(totalUsage, usage);

    if (!draft) {
      if (postType === "quote") metrics.draftsSkippedNoQuote++;
      continue;
    }

    if (!draft.content) continue;

    const contentHash = hashContent(draft.content);
    if (seenHashes.has(contentHash)) {
      metrics.draftsDeduplicated++;
      continue;
    }

    const qualityScore = computeQualityScore({
      postType,
      content: draft.content,
      typeData: draft.typeData,
      sourceChunkCount: sourceChunks.length,
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
      postType,
      content: draft.content,
      typeData: castTypeData(postType, draft.typeData),
      sourceChunkIds: sourceChunks.map((c) => c._id),
      contentHash,
      qualityScore,
      sectionQualitySignal: input.sectionQualitySignal,
      generationBatch: input.generationBatch ?? 1,
      strategy: "section",
    });
  }

  if (services.validator && candidates.length > 0) {
    const validationResults = await Promise.allSettled(
      candidates.map((candidate) =>
        services.validator!.validateDraft({
          postType: candidate.postType,
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
        // Fail open: keep the draft without a semantic score. Serving falls back to qualityScore.
        drafts.push(candidates[i]!);
        metrics.draftsGenerated++;
        continue;
      }

      totalUsage = addUsage(totalUsage, vResult.value.usage);
      if (!vResult.value.isValid) {
        metrics.draftsRejectedValidation++;
        metrics.validationRejections.push({
          postType: candidates[i]!.postType,
          reason: vResult.value.rejectionReason ?? "Unknown",
        });
        continue;
      }

      drafts.push({
        ...candidates[i]!,
        semanticQualityScore: vResult.value.semanticQualityScore,
      });
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
