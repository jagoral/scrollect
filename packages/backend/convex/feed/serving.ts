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
import type { ScoredDraft } from "./logic/scoring";

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

      const scoringInput: ScoredDraft[] = draftsToScore.map((d) => ({
        id: d._id,
        documentId: d.documentId,
        cardType: d.cardType,
        strategy: d.strategy,
        qualityScore: d.qualityScore,
        servedCount: d.servedCount ?? 0,
        documentCreatedAt: docMap.get(d.documentId)?.createdAt ?? d.createdAt,
      }));

      const ranked = scoreDrafts({ drafts: scoringInput, config, now: Date.now() });
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

      const elapsedMs = evt.getElapsedMs();
      evt.set({
        userId,
        draftPoolSize: draftsToScore.length,
        batchSize: topDrafts.length,
        isDepleted,
        remainingPending,
        replenishmentTriggered,
      });

      await ctx.scheduler.runAfter(0, internal.feed.servingAnalytics.captureServingAnalytics, {
        userId,
        cardCount: postIds.length,
        elapsedMs,
        isDepleted,
        remainingPending,
        replenishmentTriggered,
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
