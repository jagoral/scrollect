import type { GenericMutationCtx } from "convex/server";

import type { DataModel, Doc, Id } from "../../_generated/dataModel";
import type { ScoredDraftWithScore } from "../../../src/feed/logic/scoring";
import type { Attribution } from "./attribution";

type MutationCtx = GenericMutationCtx<DataModel>;

export async function materializeServedPosts(
  ctx: MutationCtx,
  params: {
    userId: string;
    topDrafts: ScoredDraftWithScore[];
    draftMap: Map<string, Doc<"postDrafts">>;
    documentMap: Map<string, Doc<"documents"> | null>;
    attributions: Map<string, Attribution>;
  },
): Promise<Id<"posts">[]> {
  const postIds: Id<"posts">[] = [];

  for (const scored of params.topDrafts) {
    const draft = params.draftMap.get(scored.id)!;
    const document = params.documentMap.get(draft.documentId);
    const attribution = params.attributions.get(scored.id)!;

    const postId = await ctx.db.insert("posts", {
      content: draft.content,
      postType: draft.postType,
      typeData: draft.typeData,
      primarySourceDocumentId: draft.documentId,
      primarySourceDocumentTitle: document?.title ?? "Unknown",
      postDraftId: draft._id,
      sectionTitle: attribution.sectionTitle,
      pageStart: attribution.pageStart,
      pageEnd: attribution.pageEnd,
      fileType: document?.fileType ?? "text",
      userId: params.userId,
      createdAt: Date.now(),
    });

    await ctx.db.patch(draft._id, {
      status: draft.status === "pending" ? "served" : draft.status,
      servedCount: (draft.servedCount ?? 0) + 1,
    });

    postIds.push(postId);
  }

  return postIds;
}
