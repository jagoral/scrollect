import type { Doc } from "../../_generated/dataModel";
import type { DraftForServing } from "../../../src/feed/logic/servingPlan";

export function toDraftForServing(draft: Doc<"postDrafts">): DraftForServing {
  return {
    id: draft._id,
    documentId: draft.documentId,
    sectionSummaryId: draft.sectionSummaryId,
    postType: draft.postType,
    strategy: draft.strategy,
    qualityScore: draft.qualityScore,
    semanticQualityScore: draft.semanticQualityScore,
    sectionQualitySignal: draft.sectionQualitySignal,
    servedCount: draft.servedCount ?? 0,
    status: draft.status,
    createdAt: draft.createdAt,
  };
}
