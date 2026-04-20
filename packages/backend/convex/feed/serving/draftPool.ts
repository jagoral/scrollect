import type { GenericMutationCtx } from "convex/server";

import type { DataModel, Doc, Id } from "../../_generated/dataModel";
import {
  determineEmptyReasonForScope,
  PROCESSING_STAGE_VALUES,
} from "../../../src/feed/logic/servingScope";
import type { EmptyReason, ServingScope } from "../../../src/feed/logic/servingScope";

type MutationCtx = GenericMutationCtx<DataModel>;

export type DraftPool = {
  scopedDocument: Doc<"documents"> | null;
  pendingDrafts: Doc<"postDrafts">[];
  servedDrafts: Doc<"postDrafts">[];
  draftsToScore: Doc<"postDrafts">[];
  isDepleted: boolean;
};

export async function loadDraftPoolForServing(
  ctx: MutationCtx,
  params: { userId: string; scope: ServingScope },
): Promise<DraftPool> {
  const scopedDocument =
    params.scope.kind === "document"
      ? await getOwnedDocument(ctx, {
          documentId: params.scope.documentId as Id<"documents">,
          userId: params.userId,
        })
      : null;

  if (params.scope.kind === "document" && !scopedDocument) {
    throw new Error("Document not found");
  }

  const pendingDrafts = await loadPendingDrafts(ctx, params);
  const servedDrafts =
    params.scope.kind === "document" ? [] : await loadServedDrafts(ctx, params.userId);
  const draftsToScore = [...pendingDrafts, ...servedDrafts];

  return {
    scopedDocument,
    pendingDrafts,
    servedDrafts,
    draftsToScore,
    isDepleted: pendingDrafts.length === 0,
  };
}

export async function determineEmptyReasonForDraftPool(
  ctx: MutationCtx,
  params: { userId: string; scope: ServingScope; scopedDocument: Doc<"documents"> | null },
): Promise<EmptyReason> {
  const hasAnyDocument =
    params.scope.kind === "document"
      ? params.scopedDocument !== null
      : (await ctx.db
          .query("documents")
          .withIndex("by_userId", (q) => q.eq("userId", params.userId))
          .first()) !== null;

  const hasProcessingDocument =
    params.scope.kind === "document"
      ? false
      : (
          await Promise.all(
            PROCESSING_STAGE_VALUES.map((status) =>
              ctx.db
                .query("documents")
                .withIndex("by_userId_status", (q) =>
                  q.eq("userId", params.userId).eq("status", status),
                )
                .first(),
            ),
          )
        ).some((document) => document !== null);

  return determineEmptyReasonForScope({
    scope: params.scope,
    documentStatus: params.scopedDocument?.status,
    hasAnyDocument,
    hasProcessingDocument,
  });
}

async function getOwnedDocument(
  ctx: MutationCtx,
  params: { documentId: Id<"documents">; userId: string },
): Promise<Doc<"documents"> | null> {
  const document = await ctx.db.get(params.documentId);
  if (!document || document.userId !== params.userId) return null;
  return document;
}

async function loadPendingDrafts(
  ctx: MutationCtx,
  params: { userId: string; scope: ServingScope },
): Promise<Doc<"postDrafts">[]> {
  if (params.scope.kind === "document") {
    const documentId = params.scope.documentId as Id<"documents">;
    return await ctx.db
      .query("postDrafts")
      .withIndex("by_documentId_status", (q) =>
        q.eq("documentId", documentId).eq("status", "pending"),
      )
      .take(2000);
  }

  return await ctx.db
    .query("postDrafts")
    .withIndex("by_userId_status", (q) => q.eq("userId", params.userId).eq("status", "pending"))
    .take(2000);
}

async function loadServedDrafts(ctx: MutationCtx, userId: string): Promise<Doc<"postDrafts">[]> {
  return await ctx.db
    .query("postDrafts")
    .withIndex("by_userId_status", (q) => q.eq("userId", userId).eq("status", "served"))
    .take(2000);
}
