import type { GenericMutationCtx } from "convex/server";

import type { DataModel, Id } from "../../_generated/dataModel";
import { requireAuth } from "../../lib/functions";
import { WideEvent } from "../../../src/platform/logging";
import {
  buildServingConfig,
  servingScopeDocumentId,
  servingScopeLabel,
  shouldScheduleReplenishmentForScope,
} from "../../../src/feed/logic/servingScope";
import type { ServingScope } from "../../../src/feed/logic/servingScope";
import {
  buildScoredDrafts,
  buildServingAnalyticsPayload,
  countPendingServedDrafts,
  rankDraftsForServing,
  summarizeDraftsPerDocument,
} from "../../../src/feed/logic/servingPlan";
import { scheduleServingAnalytics } from "./analytics";
import { resolveAttributions } from "./attribution";
import { toDraftForServing } from "./draftInputs";
import { determineEmptyReasonForDraftPool, loadDraftPoolForServing } from "./draftPool";
import { resolveGoalEmbeddings } from "./goalEmbeddings";
import { hydrateDraftPoolForServing } from "./hydration";
import { materializeServedPosts } from "./materialization";
import { buildReactionSummary, summarizeReactionStats } from "./reactions";
import { maybeScheduleReplenishment } from "./replenishment";
import { resolveGoalAwareSectionEmbeddings } from "./sectionEmbeddings";

type MutationCtx = GenericMutationCtx<DataModel>;

export type ServingResult =
  | { posts: Id<"posts">[]; reason?: undefined }
  | { posts: []; reason: "no_drafts" | "processing" };

export async function serveFeedForScope(
  ctx: MutationCtx,
  params: { scope: ServingScope },
): Promise<ServingResult> {
  const evt = new WideEvent("feed.serveFeed");
  const user = await requireAuth(ctx);
  const userId = user._id;
  const config = buildServingConfig(params.scope);
  const documentId = servingScopeDocumentId(params.scope);
  const feedScope = servingScopeLabel(params.scope);

  try {
    const draftPool = await loadDraftPoolForServing(ctx, { userId, scope: params.scope });

    if (draftPool.draftsToScore.length === 0) {
      const emptyReason = await determineEmptyReasonForDraftPool(ctx, {
        userId,
        scope: params.scope,
        scopedDocument: draftPool.scopedDocument,
      });
      evt.set({ userId, documentId, feedScope, emptyReason, draftPoolSize: 0 });
      return { posts: [], reason: emptyReason };
    }

    const hydrated = await hydrateDraftPoolForServing(ctx, { drafts: draftPool.draftsToScore });
    const draftInputs = draftPool.draftsToScore.map(toDraftForServing);
    const scoringInput = buildScoredDrafts({
      drafts: draftInputs,
      documentsById: hydrated.documentsById,
      sectionsById: hydrated.sectionsById,
      draftsPerDocument: hydrated.draftsPerDocument,
    });

    const { summary: reactionSummary, feedbackRows } = await buildReactionSummary(ctx, {
      userId,
      draftsToScore: draftPool.draftsToScore,
    });

    const { byDocument: goalEmbeddingByDocument, sourceCounts: goalSourceCounts } =
      await resolveGoalEmbeddings(ctx, {
        documentIds: hydrated.documentIds,
      });
    const now = Date.now();
    const { candidateSectionIds, sectionEmbeddings, sectionEmbeddingCoverage } =
      await resolveGoalAwareSectionEmbeddings(ctx, {
        goalEmbeddingByDocument,
        scoringInput,
        config,
        reactionSummary,
        now,
      });

    const topDrafts = rankDraftsForServing({
      scoringInput,
      config,
      reactionSummary,
      goalEmbeddingByDocument,
      sectionEmbeddings,
      now,
    });

    const draftMap = new Map(draftPool.draftsToScore.map((draft) => [draft._id as string, draft]));
    const attributions = await resolveAttributions(ctx, {
      topDrafts,
      draftMap,
      sectionMap: hydrated.sectionsById,
    });
    const postIds = await materializeServedPosts(ctx, {
      userId,
      topDrafts,
      draftMap,
      documentMap: hydrated.documentsById,
      attributions,
    });

    const draftStatusById = new Map(draftInputs.map((draft) => [draft.id, draft.status]));
    const pendingServedCount = countPendingServedDrafts({ topDrafts, draftStatusById });
    const remainingPending = draftPool.pendingDrafts.length - pendingServedCount;

    let replenishmentTriggered = false;
    if (shouldScheduleReplenishmentForScope({ scope: params.scope, remainingPending, config })) {
      replenishmentTriggered = await maybeScheduleReplenishment(ctx, { userId });
    }

    const reactionStats = summarizeReactionStats({ summary: reactionSummary, feedbackRows });
    const draftsPerDocumentStats = summarizeDraftsPerDocument(hydrated.draftsPerDocument);
    const analyticsPayload = buildServingAnalyticsPayload({
      drafts: draftInputs,
      topDrafts,
      documentsById: hydrated.documentsById,
      draftsPerDocument: hydrated.draftsPerDocument,
      goalEmbeddingByDocument,
      sectionEmbeddings,
      sectionEmbeddingCoverage,
      candidateSectionIds,
      config,
      now: Date.now(),
    });

    evt.set({
      userId,
      documentId,
      feedScope,
      draftPoolSize: draftPool.draftsToScore.length,
      batchSize: topDrafts.length,
      isDepleted: draftPool.isDepleted,
      remainingPending,
      replenishmentTriggered,
      goalEmbeddingPresent: goalEmbeddingByDocument.size > 0,
      goalEmbeddingDocumentCount: goalEmbeddingByDocument.size,
      goalSourceTopicCount: goalSourceCounts.topic,
      goalSourceDocumentCount: goalSourceCounts.document,
      goalSourceNoneCount: goalSourceCounts.none,
      sectionEmbeddingCoverage,
      ...reactionStats,
    });

    await scheduleServingAnalytics(ctx, {
      userId,
      postCount: postIds.length,
      elapsedMs: evt.getElapsedMs(),
      isDepleted: draftPool.isDepleted,
      remainingPending,
      replenishmentTriggered,
      draftsPerDocumentStats,
      reactionStats,
      analyticsPayload,
    });

    return { posts: postIds };
  } catch (error) {
    evt.setError(error);
    throw error;
  } finally {
    evt.emit();
  }
}
