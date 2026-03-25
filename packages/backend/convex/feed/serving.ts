import { v } from "convex/values";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { GenericMutationCtx } from "convex/server";
import type { DataModel, Doc } from "../_generated/dataModel";
import { mutation } from "../_generated/server";
import { requireAuth } from "../lib/functions";
import { WideEvent } from "../lib/logging";
import { UNGROUPED_SENTINEL } from "./logic/constants";
import { DEFAULT_SCORING_CONFIG, scoreDrafts } from "./logic/scoring";
import type { DislikeSignal, ReactionSummary, ScoredDraft } from "./logic/scoring";

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

      const scoringInput: ScoredDraft[] = draftsToScore.map((d) => ({
        id: d._id,
        documentId: d.documentId,
        sectionSummaryId: d.sectionSummaryId as string | undefined,
        cardType: d.cardType,
        strategy: d.strategy,
        qualityScore: d.qualityScore,
        servedCount: d.servedCount ?? 0,
        totalDraftsForDocument: draftsPerDocument.get(d.documentId) ?? 1,
        documentCreatedAt: docMap.get(d.documentId)?.createdAt ?? d.createdAt,
      }));

      const { summary: reactionSummary, feedbackRows } = await buildReactionSummary(
        ctx,
        userId,
        draftsToScore,
      );

      const ranked = scoreDrafts({
        drafts: scoringInput,
        config,
        now: Date.now(),
        reactionSummary,
      });
      const topDrafts = ranked.slice(0, config.batchSize);

      const draftMap = new Map(draftsToScore.map((d) => [d._id as string, d]));

      // Issue #5: Batch attribution lookups instead of per-draft sequential reads
      const attributions = await batchResolveAttributions(ctx, topDrafts, draftMap);

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
        ...reactionStats,
      });

      const draftCounts = [...draftsPerDocument.values()];
      const draftsPerDocumentStats = {
        min: Math.min(...draftCounts),
        max: Math.max(...draftCounts),
        avg: draftCounts.reduce((sum, n) => sum + n, 0) / draftCounts.length,
        documentCount: draftCounts.length,
      };

      await ctx.scheduler.runAfter(0, internal.feed.servingAnalytics.captureServingAnalytics, {
        userId,
        cardCount: postIds.length,
        elapsedMs,
        isDepleted,
        remainingPending,
        replenishmentTriggered,
        draftsPerDocumentStats,
        reactionStats,
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

  const dislikesByReason: Record<string, number> = {};
  for (const signal of summary.dislikedSections.values()) {
    dislikesByReason[signal] = (dislikesByReason[signal] ?? 0) + 1;
  }
  const wrongTypeCount = summary.dislikedCardTypes.size;
  if (wrongTypeCount > 0) {
    dislikesByReason["wrong_type"] = wrongTypeCount;
  }
  const rejectedCount = summary.rejectedDraftIds.size;
  if (rejectedCount > 0) {
    dislikesByReason["low_quality"] = rejectedCount;
  }

  return {
    totalLikes,
    totalDislikes,
    dislikesByReason,
    penalizedSections: summary.dislikedSections.size,
    penalizedCardTypes: summary.dislikedCardTypes.size,
    rejectedDrafts: rejectedCount,
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

  const sections = await Promise.all(uniqueSectionIds.map((id) => ctx.db.get(id)));
  const sectionMap = new Map(uniqueSectionIds.map((id, i) => [id, sections[i]]));

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

  await ctx.scheduler.runAfter(0, internal.pipeline.cardDraftGeneration.regenerateDrafts, {
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
