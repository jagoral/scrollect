import type { GenericMutationCtx } from "convex/server";

import type { DataModel, Doc, Id } from "../../_generated/dataModel";
import type { ScoredDraftWithScore } from "../../../src/feed/logic/scoring";
import { pickActiveTopicForDocument } from "../../../src/feed/logic/pickActiveTopicForDocument";
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
  // Resolve the active topic per source document once for this batch (B1).
  // Posts written here are stamped with `topicId` so topic-scoped pagination
  // can use the `by_userId_topic` index rather than paging then filtering.
  const uniqueDocIds = new Set<Id<"documents">>();
  for (const scored of params.topDrafts) {
    const draft = params.draftMap.get(scored.id);
    if (draft) uniqueDocIds.add(draft.documentId);
  }

  const topicIdByDocument = await resolveActiveTopicByDocument(ctx, [...uniqueDocIds]);

  const postIds: Id<"posts">[] = [];

  for (const scored of params.topDrafts) {
    const draft = params.draftMap.get(scored.id)!;
    const document = params.documentMap.get(draft.documentId);
    const attribution = params.attributions.get(scored.id)!;
    const topicId = topicIdByDocument.get(draft.documentId);

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
      topicId,
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

async function resolveActiveTopicByDocument(
  ctx: MutationCtx,
  documentIds: Id<"documents">[],
): Promise<Map<Id<"documents">, Id<"topics">>> {
  const result = new Map<Id<"documents">, Id<"topics">>();
  if (documentIds.length === 0) return result;

  const assignmentsByDoc = await Promise.all(
    documentIds.map((id) =>
      ctx.db
        .query("documentTopics")
        .withIndex("by_documentId", (q) => q.eq("documentId", id))
        .collect(),
    ),
  );

  for (let i = 0; i < documentIds.length; i += 1) {
    const documentId = documentIds[i]!;
    const assignments = assignmentsByDoc[i] ?? [];
    const activeTopicId = pickActiveTopicForDocument(
      assignments.map((a) => ({ topicId: a.topicId as string, createdAt: a.createdAt })),
    );
    if (activeTopicId !== undefined) {
      result.set(documentId, activeTopicId as Id<"topics">);
    }
  }
  return result;
}
