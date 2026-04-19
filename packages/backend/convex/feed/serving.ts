import { v } from "convex/values";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { GenericMutationCtx } from "convex/server";
import type { DataModel, Doc } from "../_generated/dataModel";
import { mutation } from "../_generated/server";
import { requireAuth } from "../lib/functions";
import { WideEvent } from "../../src/platform/logging";
import { UNGROUPED_SENTINEL } from "../../src/feed/logic/constants";
import { DEFAULT_SCORING_CONFIG, scoreDrafts } from "../../src/feed/logic/scoring";
import type { DislikeSignal, ReactionSummary, ScoredDraft } from "../../src/feed/logic/scoring";
import {
  computeBookDepthReach,
  computeCardTypeMix,
  computeQualityDistribution,
  firstSessionDocuments,
  summarizeGoalRelevance,
} from "../../src/feed/logic/servingAnalyticsMetrics";
import { fetchSectionEmbeddings, getEffectiveLearningGoalEmbedding } from "./learningGoal";

/** Top-K factor over batchSize for goal-aware re-scoring. ADR-018 §3. */
const GOAL_CANDIDATE_FACTOR = 3;

type MutationCtx = GenericMutationCtx<DataModel>;

type ServingResult =
  | { posts: Id<"posts">[]; reason?: undefined }
  | { posts: []; reason: "no_drafts" | "processing" };

const REPLENISHMENT_COOLDOWN_MS = 60_000;

export const serveFeed = mutation({
  args: {},
  returns: v.object({
    posts: v.array(v.id("posts")),
    reason: v.optional(v.union(v.literal("no_drafts"), v.literal("processing"))),
  }),
  handler: async (ctx, _args): Promise<ServingResult> => {
    const evt = new WideEvent("feed.serveFeed");
    const user = await requireAuth(ctx);
    const userId = user._id;
    const config = DEFAULT_SCORING_CONFIG;

    try {
      // Bounded queries - ADR-016 recommends revisiting at 10k drafts per user
      const pendingDrafts = await ctx.db
        .query("cardDrafts")
        .withIndex("by_userId_status", (q) => q.eq("userId", userId).eq("status", "pending"))
        .take(2000);

      const servedDrafts = await ctx.db
        .query("cardDrafts")
        .withIndex("by_userId_status", (q) => q.eq("userId", userId).eq("status", "served"))
        .take(2000);

      if (pendingDrafts.length === 0 && servedDrafts.length === 0) {
        const emptyReason = await determineEmptyReason(ctx, userId);
        evt.set({ userId, emptyReason, draftPoolSize: 0 });
        return { posts: [], reason: emptyReason };
      }

      // Issue #4: Merge both pools - saturation penalty 1/(1+servedCount) handles ranking
      const draftsToScore = [...pendingDrafts, ...servedDrafts];
      const isDepleted = pendingDrafts.length === 0;

      const uniqueDocIds = [...new Set(draftsToScore.map((d) => d.documentId))];
      const docs = await Promise.all(uniqueDocIds.map((id) => ctx.db.get(id)));
      const docMap = new Map(uniqueDocIds.map((id, i) => [id, docs[i]]));

      const draftsPerDocument = new Map<string, number>();
      for (const d of draftsToScore) {
        draftsPerDocument.set(d.documentId, (draftsPerDocument.get(d.documentId) ?? 0) + 1);
      }

      // Pre-fetch chunk counts per document so book-position diversity (ADR-018 §5) can
      // normalize chunkStartIndex into [0, 1]. Documents reuse the cached docMap.
      const sectionIdsToHydrate = [
        ...new Set(
          draftsToScore
            .map((d) => d.sectionSummaryId)
            .filter((id): id is Id<"sectionSummaries"> => id !== undefined),
        ),
      ];
      const sectionRows = await Promise.all(sectionIdsToHydrate.map((id) => ctx.db.get(id)));
      const sectionRowMap = new Map(
        sectionIdsToHydrate.map((id, i) => [id as string, sectionRows[i]]),
      );

      const scoringInput: ScoredDraft[] = draftsToScore.map((d) => {
        const section = d.sectionSummaryId
          ? sectionRowMap.get(d.sectionSummaryId as string)
          : undefined;
        const doc = docMap.get(d.documentId);
        return {
          id: d._id,
          documentId: d.documentId,
          sectionSummaryId: d.sectionSummaryId as string | undefined,
          cardType: d.cardType,
          strategy: d.strategy,
          qualityScore: d.qualityScore,
          semanticQualityScore: d.semanticQualityScore,
          sectionQualitySignal: d.sectionQualitySignal,
          servedCount: d.servedCount ?? 0,
          totalDraftsForDocument: draftsPerDocument.get(d.documentId) ?? 1,
          documentCreatedAt: doc?.createdAt ?? d.createdAt,
          chunkStartIndex: section?.chunkStartIndex,
          documentChunkCount: doc?.chunkCount,
        };
      });

      const { summary: reactionSummary, feedbackRows } = await buildReactionSummary(
        ctx,
        userId,
        draftsToScore,
      );

      // Per ADR-018 §3: resolve per-document goal embeddings through the future-ready
      // resolver seam. The scorer looks up each draft's own document embedding, so a
      // pool spanning multiple documents ranks each draft against its own goal.
      const goalResolutions = await Promise.all(
        uniqueDocIds.map(async (id) => ({
          id,
          embedding: await getEffectiveLearningGoalEmbedding(ctx, id),
        })),
      );
      const goalEmbeddingByDocument = new Map<string, number[]>();
      for (const { id, embedding } of goalResolutions) {
        if (embedding !== undefined) goalEmbeddingByDocument.set(id, embedding);
      }

      // Two-pass scoring: first pass without goal vectors picks top-K candidates whose
      // section vectors we then fetch; second pass re-scores with the partial map. Drafts
      // outside the top-K keep `goalRelevance = 1.0` (their section vec is absent from
      // the map). Bounds Convex db reads to `batchSize * 3` rows.
      let sectionEmbeddings: Map<string, number[]> | undefined;
      let sectionEmbeddingCoverage = 1;
      let candidateSectionIds: string[] = [];
      if (goalEmbeddingByDocument.size > 0) {
        const candidatePass = scoreDrafts({
          drafts: scoringInput,
          config,
          now: Date.now(),
          reactionSummary,
        });
        const candidateLimit = config.batchSize * GOAL_CANDIDATE_FACTOR;
        candidateSectionIds = [
          ...new Set(
            candidatePass
              .slice(0, candidateLimit)
              .map((d) => d.sectionSummaryId)
              .filter((id): id is string => id !== undefined),
          ),
        ];
        const fetched = await fetchSectionEmbeddings(
          ctx,
          candidateSectionIds as Id<"sectionSummaries">[],
        );
        sectionEmbeddings = fetched.embeddings;
        sectionEmbeddingCoverage = fetched.coverage;
      }

      const ranked = scoreDrafts({
        drafts: scoringInput,
        config,
        now: Date.now(),
        reactionSummary,
        goalEmbeddingByDocument,
        sectionEmbeddings,
      });
      const topDrafts = ranked.slice(0, config.batchSize);

      const draftMap = new Map(draftsToScore.map((d) => [d._id as string, d]));

      // Issue #5: Batch attribution lookups instead of per-draft sequential reads.
      // Section rows were already hoisted above for book-position diversity, so reuse
      // them rather than re-fetching the same documents.
      const attributions = await batchResolveAttributions(ctx, topDrafts, draftMap, sectionRowMap);

      const postIds: Id<"posts">[] = [];

      for (const scored of topDrafts) {
        const draft = draftMap.get(scored.id)!;
        const doc = docMap.get(draft.documentId);
        const fileType = doc?.fileType ?? "text";
        const attribution = attributions.get(scored.id)!;

        const postId = await ctx.db.insert("posts", {
          content: draft.content,
          postType: draft.cardType,
          typeData: draft.typeData,
          primarySourceDocumentId: draft.documentId,
          primarySourceDocumentTitle: doc?.title ?? "Unknown",
          cardDraftId: draft._id,
          sectionTitle: attribution.sectionTitle,
          pageStart: attribution.pageStart,
          pageEnd: attribution.pageEnd,
          fileType,
          userId,
          createdAt: Date.now(),
        });

        const newStatus = draft.status === "pending" ? ("served" as const) : draft.status;
        await ctx.db.patch(draft._id, {
          status: newStatus,
          servedCount: (draft.servedCount ?? 0) + 1,
        });

        postIds.push(postId);
      }

      const pendingServedCount = topDrafts.filter(
        (d) => draftMap.get(d.id)?.status === "pending",
      ).length;
      const remainingPending = pendingDrafts.length - pendingServedCount;

      let replenishmentTriggered = false;
      if (remainingPending < config.replenishmentThreshold) {
        replenishmentTriggered = await maybeScheduleReplenishment(ctx, userId);
      }

      const reactionStats = summarizeReactionStats(reactionSummary, feedbackRows);

      const elapsedMs = evt.getElapsedMs();
      evt.set({
        userId,
        draftPoolSize: draftsToScore.length,
        batchSize: topDrafts.length,
        isDepleted,
        remainingPending,
        replenishmentTriggered,
        goalEmbeddingPresent: goalEmbeddingByDocument.size > 0,
        goalEmbeddingDocumentCount: goalEmbeddingByDocument.size,
        sectionEmbeddingCoverage,
        ...reactionStats,
      });

      const draftCounts = [...draftsPerDocument.values()];
      const draftsPerDocumentStats = {
        min: Math.min(...draftCounts),
        max: Math.max(...draftCounts),
        avg: draftCounts.reduce((sum, n) => sum + n, 0) / draftCounts.length,
        documentCount: draftCounts.length,
      };

      // ADR-018 §7 analytics. Compute against the pre-patch snapshot so prior-served
      // counts reflect cumulative serves BEFORE this batch. Pure helpers live in
      // src/feed/logic/servingAnalyticsMetrics.ts so they are covered by unit tests.
      const priorServedByDocument = new Map<string, number>();
      for (const d of draftsToScore) {
        priorServedByDocument.set(
          d.documentId,
          (priorServedByDocument.get(d.documentId) ?? 0) + (d.servedCount ?? 0),
        );
      }
      const documentInputs = [...draftsPerDocument.keys()].map((documentId) => ({
        documentId,
        documentCreatedAt: docMap.get(documentId as Id<"documents">)?.createdAt ?? 0,
        priorServedCount: priorServedByDocument.get(documentId) ?? 0,
      }));
      const firstSessionBatches = firstSessionDocuments({
        topDrafts,
        documentInputs,
        now: Date.now(),
      });
      const bookDepthReaches = firstSessionBatches
        .map(computeBookDepthReach)
        .filter((r): r is NonNullable<typeof r> => r !== null);
      const cardTypeMixes = firstSessionBatches.map(computeCardTypeMix);
      const qualityDistribution = computeQualityDistribution(topDrafts);
      const goalRelevance = summarizeGoalRelevance({
        goalEmbeddingByDocument,
        topDrafts,
        sectionEmbeddings,
        candidateSectionIds,
        goalRelevanceAlpha: config.goalRelevanceAlpha,
        goalRelevanceFloor: config.goalRelevanceFloor,
      });
      // Override the architect-I3 coverage with the pool-wide coverage already measured
      // by `fetchSectionEmbeddings`. `summarizeGoalRelevance.sectionEmbeddingCoveragePercent`
      // would otherwise only reflect the set of IDs we passed in, which matches the same
      // value today - but using the authoritative `sectionEmbeddingCoverage` keeps the
      // analytics aligned with the scorer's view of degraded-vector state.
      const goalRelevancePayload = goalRelevance.applied
        ? { ...goalRelevance, sectionEmbeddingCoveragePercent: sectionEmbeddingCoverage }
        : goalRelevance;

      await ctx.scheduler.runAfter(0, internal.feed.servingAnalytics.captureServingAnalytics, {
        userId,
        cardCount: postIds.length,
        elapsedMs,
        isDepleted,
        remainingPending,
        replenishmentTriggered,
        draftsPerDocumentStats,
        reactionStats,
        bookDepthReaches,
        cardTypeMixes,
        qualityDistribution: qualityDistribution ?? undefined,
        goalRelevance: goalRelevancePayload,
      });

      return { posts: postIds };
    } catch (error) {
      evt.setError(error);
      throw error;
    } finally {
      evt.emit();
    }
  },
});

type ReactionStats = {
  totalLikes: number;
  totalDislikes: number;
  dislikesByReason: Record<string, number>;
  penalizedSections: number;
  penalizedCardTypes: number;
  rejectedDrafts: number;
};

async function buildReactionSummary(
  ctx: MutationCtx,
  userId: string,
  draftsToScore: Doc<"cardDrafts">[],
): Promise<{ summary: ReactionSummary; feedbackRows: Doc<"reactionFeedback">[] }> {
  // Cap at 500 most recent rows to bound memory. Recent signals matter more
  // for scoring, so we order desc and drop the oldest if the user exceeds 500.
  const feedbackRows = await ctx.db
    .query("reactionFeedback")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .order("desc")
    .take(500);

  const draftLookup = new Map(draftsToScore.map((d) => [d._id as string, d]));

  const dislikedSections = new Map<string, DislikeSignal>();
  const dislikedCardTypes = new Set<string>();
  const likedSections = new Set<string>();
  const likedCardTypes = new Set<string>();
  const rejectedDraftIds = new Set<string>();

  // Batch-fetch all out-of-pool drafts upfront to avoid N+1 sequential reads
  const missingDraftIds = [
    ...new Set(
      feedbackRows
        .filter((fb) => !draftLookup.has(fb.cardDraftId as string))
        .map((fb) => fb.cardDraftId),
    ),
  ];
  const resolvedDrafts = await Promise.all(missingDraftIds.map((id) => ctx.db.get(id)));
  const resolvedMap = new Map(missingDraftIds.map((id, i) => [id as string, resolvedDrafts[i]]));

  for (const fb of feedbackRows) {
    const draft =
      draftLookup.get(fb.cardDraftId as string) ?? resolvedMap.get(fb.cardDraftId as string);
    if (!draft) continue;
    applyFeedbackSignals(draft, fb, {
      dislikedSections,
      dislikedCardTypes,
      likedSections,
      likedCardTypes,
      rejectedDraftIds,
    });
  }

  return {
    summary: {
      dislikedSections,
      dislikedCardTypes,
      likedSections,
      likedCardTypes,
      rejectedDraftIds,
    },
    feedbackRows,
  };
}

function applyFeedbackSignals(
  draft: Doc<"cardDrafts">,
  fb: Doc<"reactionFeedback">,
  summary: ReactionSummary,
): void {
  const sectionId = draft.sectionSummaryId as string | undefined;

  if (fb.reaction === "like") {
    if (sectionId) summary.likedSections.add(sectionId);
    summary.likedCardTypes.add(draft.cardType);
    return;
  }

  if (fb.dislikeReason === "low_quality") {
    summary.rejectedDraftIds.add(fb.cardDraftId as string);
    return;
  }

  if (fb.dislikeReason === "wrong_type") {
    summary.dislikedCardTypes.add(draft.cardType);
  }

  if (
    (fb.dislikeReason === "not_interesting" || fb.dislikeReason === "already_know") &&
    sectionId
  ) {
    const existing = summary.dislikedSections.get(sectionId);
    // "already_know" is stronger than "not_interesting" (0.1 vs 0.3)
    if (!existing || fb.dislikeReason === "already_know") {
      summary.dislikedSections.set(sectionId, fb.dislikeReason);
    }
  }
}

function summarizeReactionStats(
  summary: ReactionSummary,
  feedbackRows: Doc<"reactionFeedback">[],
): ReactionStats {
  // Count actual feedback rows to avoid double-counting. A single like populates
  // both likedSections and likedCardTypes, so set sizes would overcount.
  const totalLikes = feedbackRows.filter((fb) => fb.reaction === "like").length;
  const totalDislikes = feedbackRows.filter((fb) => fb.reaction === "dislike").length;

  // Count reason occurrences from raw rows (not deduplicated summary sets)
  // to avoid undercounting when multiple cards share a section or type.
  const dislikesByReason: Record<string, number> = {};
  for (const fb of feedbackRows) {
    if (fb.reaction === "dislike" && fb.dislikeReason) {
      dislikesByReason[fb.dislikeReason] = (dislikesByReason[fb.dislikeReason] ?? 0) + 1;
    }
  }

  return {
    totalLikes,
    totalDislikes,
    dislikesByReason,
    penalizedSections: summary.dislikedSections.size,
    penalizedCardTypes: summary.dislikedCardTypes.size,
    rejectedDrafts: summary.rejectedDraftIds.size,
  };
}

type Attribution = {
  sectionTitle: string | undefined;
  pageStart: number | undefined;
  pageEnd: number | undefined;
};

type ScoredDraftRef = { id: string };

async function batchResolveAttributions(
  ctx: MutationCtx,
  topDrafts: ScoredDraftRef[],
  draftMap: Map<string, Doc<"cardDrafts">>,
  prebuiltSectionMap?: Map<string, Doc<"sectionSummaries"> | null>,
): Promise<Map<string, Attribution>> {
  const noAttribution: Attribution = {
    sectionTitle: undefined,
    pageStart: undefined,
    pageEnd: undefined,
  };

  const uniqueSectionIds = [
    ...new Set(
      topDrafts
        .map((d) => draftMap.get(d.id)?.sectionSummaryId)
        .filter((id): id is Id<"sectionSummaries"> => id !== undefined),
    ),
  ];

  let sectionMap: Map<string, Doc<"sectionSummaries"> | null>;
  if (prebuiltSectionMap) {
    sectionMap = new Map();
    for (const id of uniqueSectionIds) {
      sectionMap.set(id as string, prebuiltSectionMap.get(id as string) ?? null);
    }
  } else {
    const sections = await Promise.all(uniqueSectionIds.map((id) => ctx.db.get(id)));
    sectionMap = new Map(uniqueSectionIds.map((id, i) => [id as string, sections[i]]));
  }
  const sections = [...sectionMap.values()];

  type ChunkKey = { documentId: Id<"documents">; chunkIndex: number };
  const chunkKeysToFetch: ChunkKey[] = [];

  for (const section of sections) {
    if (!section) continue;
    const draft = topDrafts.find((d) => draftMap.get(d.id)?.sectionSummaryId === section._id);
    if (!draft) continue;
    const draftDoc = draftMap.get(draft.id)!;

    chunkKeysToFetch.push({
      documentId: draftDoc.documentId,
      chunkIndex: section.chunkStartIndex,
    });
    if (section.chunkStartIndex !== section.chunkEndIndex) {
      chunkKeysToFetch.push({
        documentId: draftDoc.documentId,
        chunkIndex: section.chunkEndIndex,
      });
    }
  }

  const uniqueChunkKeys = [
    ...new Map(chunkKeysToFetch.map((k) => [`${k.documentId}:${k.chunkIndex}`, k])).values(),
  ];

  const chunks = await Promise.all(
    uniqueChunkKeys.map((k) =>
      ctx.db
        .query("chunks")
        .withIndex("by_documentId_chunkIndex", (q) =>
          q.eq("documentId", k.documentId).eq("chunkIndex", k.chunkIndex),
        )
        .first(),
    ),
  );

  const chunkMap = new Map(
    uniqueChunkKeys.map((k, i) => [`${k.documentId}:${k.chunkIndex}`, chunks[i]]),
  );

  const result = new Map<string, Attribution>();

  for (const scored of topDrafts) {
    const draft = draftMap.get(scored.id)!;

    if (!draft.sectionSummaryId) {
      result.set(scored.id, noAttribution);
      continue;
    }

    const section = sectionMap.get(draft.sectionSummaryId);
    if (!section) {
      result.set(scored.id, noAttribution);
      continue;
    }

    const rawTitle = section.sectionTitle;
    const sectionTitle = rawTitle === UNGROUPED_SENTINEL ? undefined : rawTitle;

    const startChunk = chunkMap.get(`${draft.documentId}:${section.chunkStartIndex}`);
    const endChunk =
      section.chunkStartIndex === section.chunkEndIndex
        ? startChunk
        : chunkMap.get(`${draft.documentId}:${section.chunkEndIndex}`);

    result.set(scored.id, {
      sectionTitle,
      pageStart: startChunk?.pageNumber,
      pageEnd: endChunk?.pageNumber,
    });
  }

  return result;
}

async function maybeScheduleReplenishment(ctx: MutationCtx, userId: string): Promise<boolean> {
  const recentPending = await ctx.db
    .query("cardDrafts")
    .withIndex("by_userId_status", (q) => q.eq("userId", userId).eq("status", "pending"))
    .order("desc")
    .first();

  if (recentPending && Date.now() - recentPending._creationTime < REPLENISHMENT_COOLDOWN_MS) {
    return false;
  }

  await ctx.scheduler.runAfter(0, internal.pipeline.cardDraftReplenishment.regenerateDrafts, {
    userId,
  });
  return true;
}

async function determineEmptyReason(
  ctx: MutationCtx,
  userId: string,
): Promise<"no_drafts" | "processing"> {
  const anyDoc = await ctx.db
    .query("documents")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .first();

  if (!anyDoc) {
    return "no_drafts";
  }

  const processingStatuses = [
    "uploaded",
    "parsing",
    "chunking",
    "embedding",
    "summarizing",
    "generating_cards",
  ] as const;

  const results = await Promise.all(
    processingStatuses.map((status) =>
      ctx.db
        .query("documents")
        .withIndex("by_userId_status", (q) => q.eq("userId", userId).eq("status", status))
        .first(),
    ),
  );

  return results.some((doc) => doc !== null) ? "processing" : "no_drafts";
}
