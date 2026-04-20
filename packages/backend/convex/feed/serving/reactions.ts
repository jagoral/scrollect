import type { GenericMutationCtx } from "convex/server";

import type { DataModel, Doc } from "../../_generated/dataModel";
import type { DislikeSignal, ReactionSummary } from "../../../src/feed/logic/scoring";

type MutationCtx = GenericMutationCtx<DataModel>;

export type ReactionStats = {
  totalLikes: number;
  totalDislikes: number;
  dislikesByReason: Record<string, number>;
  penalizedSections: number;
  penalizedPostTypes: number;
  rejectedDrafts: number;
};

export async function buildReactionSummary(
  ctx: MutationCtx,
  params: { userId: string; draftsToScore: Doc<"postDrafts">[] },
): Promise<{ summary: ReactionSummary; feedbackRows: Doc<"reactionFeedback">[] }> {
  const feedbackRows = await ctx.db
    .query("reactionFeedback")
    .withIndex("by_userId", (q) => q.eq("userId", params.userId))
    .order("desc")
    .take(500);

  const draftLookup = new Map(params.draftsToScore.map((draft) => [draft._id as string, draft]));
  const missingDraftIds = [
    ...new Set(
      feedbackRows
        .filter((feedback) => !draftLookup.has(feedback.postDraftId as string))
        .map((feedback) => feedback.postDraftId),
    ),
  ];
  const resolvedDrafts = await Promise.all(missingDraftIds.map((id) => ctx.db.get(id)));
  const resolvedMap = new Map(missingDraftIds.map((id, i) => [id as string, resolvedDrafts[i]]));

  const summary: ReactionSummary = {
    dislikedSections: new Map<string, DislikeSignal>(),
    dislikedPostTypes: new Set<string>(),
    likedSections: new Set<string>(),
    likedPostTypes: new Set<string>(),
    rejectedDraftIds: new Set<string>(),
  };

  for (const feedback of feedbackRows) {
    const draft =
      draftLookup.get(feedback.postDraftId as string) ??
      resolvedMap.get(feedback.postDraftId as string);
    if (!draft) continue;
    applyFeedbackSignals({ draft, feedback, summary });
  }

  return { summary, feedbackRows };
}

export function summarizeReactionStats(input: {
  summary: ReactionSummary;
  feedbackRows: Doc<"reactionFeedback">[];
}): ReactionStats {
  const totalLikes = input.feedbackRows.filter((feedback) => feedback.reaction === "like").length;
  const totalDislikes = input.feedbackRows.filter(
    (feedback) => feedback.reaction === "dislike",
  ).length;

  const dislikesByReason: Record<string, number> = {};
  for (const feedback of input.feedbackRows) {
    if (feedback.reaction === "dislike" && feedback.dislikeReason) {
      dislikesByReason[feedback.dislikeReason] =
        (dislikesByReason[feedback.dislikeReason] ?? 0) + 1;
    }
  }

  return {
    totalLikes,
    totalDislikes,
    dislikesByReason,
    penalizedSections: input.summary.dislikedSections.size,
    penalizedPostTypes: input.summary.dislikedPostTypes.size,
    rejectedDrafts: input.summary.rejectedDraftIds.size,
  };
}

function applyFeedbackSignals(input: {
  draft: Doc<"postDrafts">;
  feedback: Doc<"reactionFeedback">;
  summary: ReactionSummary;
}): void {
  const sectionId = input.draft.sectionSummaryId as string | undefined;

  if (input.feedback.reaction === "like") {
    if (sectionId) input.summary.likedSections.add(sectionId);
    input.summary.likedPostTypes.add(input.draft.postType);
    return;
  }

  if (input.feedback.dislikeReason === "low_quality") {
    input.summary.rejectedDraftIds.add(input.feedback.postDraftId as string);
    return;
  }

  if (input.feedback.dislikeReason === "wrong_type") {
    input.summary.dislikedPostTypes.add(input.draft.postType);
  }

  if (
    (input.feedback.dislikeReason === "not_interesting" ||
      input.feedback.dislikeReason === "already_know") &&
    sectionId
  ) {
    const existing = input.summary.dislikedSections.get(sectionId);
    if (!existing || input.feedback.dislikeReason === "already_know") {
      input.summary.dislikedSections.set(sectionId, input.feedback.dislikeReason);
    }
  }
}
