"use node";

import { v } from "convex/values";

import { components, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";
import { action } from "./_generated/server";
import { requireAuth } from "./lib/functions";
import { WideEvent } from "./lib/logging";
import type { VectorDeletionServices } from "../src/providers/types";
import { executeDocumentDeletionCascade, markDocumentDeletionFailed } from "./documents/deletion";

type AccountDocumentDeletionCtx = Pick<ActionCtx, "runQuery" | "runMutation">;

type DeletionEventRecorder = {
  set(keyOrObj: string | Record<string, unknown>, value?: unknown): unknown;
};

export async function deleteAccountDocuments({
  ctx,
  userId,
  documentIds,
  evt,
  services,
}: {
  ctx: AccountDocumentDeletionCtx;
  userId: string;
  documentIds: Id<"documents">[];
  evt: DeletionEventRecorder;
  services?: VectorDeletionServices;
}): Promise<{ deletedDocumentCount: number; failedDocuments: Id<"documents">[] }> {
  const failedDocuments: Id<"documents">[] = [];
  let deletedDocumentCount = 0;

  for (const documentId of documentIds) {
    try {
      const data = await ctx.runQuery(internal.documents.getDocumentDeletionData, {
        documentId,
      });
      if (!data) continue;
      if (data.document.userId !== userId) continue;

      await executeDocumentDeletionCascade({
        ctx,
        documentId,
        userId,
        data,
        services,
      });
      deletedDocumentCount++;
    } catch (error) {
      failedDocuments.push(documentId);
      evt.set("documentError", {
        documentId,
        error: error instanceof Error ? error.message : String(error),
      });
      const recovery = await markDocumentDeletionFailed({ ctx, documentId, error });
      if (recovery.recoveryError) {
        evt.set("documentRecoveryError", {
          documentId,
          error: recovery.recoveryError,
        });
      }
    }
  }

  return { deletedDocumentCount, failedDocuments };
}

export const deleteAccount = action({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const evt = new WideEvent("accountActions.deleteAccount");

    try {
      const user = await requireAuth(ctx);
      evt.set("userId", user._id);

      const documentIds = await ctx.runQuery(internal.account.getUserDocumentIds, {
        userId: user._id,
      });
      evt.set("documentCount", documentIds.length);

      const { deletedDocumentCount, failedDocuments } = await deleteAccountDocuments({
        ctx,
        userId: user._id,
        documentIds,
        evt,
      });

      if (failedDocuments.length > 0) {
        evt.set("failedDocuments", failedDocuments);
      }
      evt.set("deletedDocumentCount", deletedDocumentCount);

      const remainingResult = await ctx.runMutation(internal.account.deleteRemainingUserData, {
        userId: user._id,
      });
      evt.set("deletedRemaining", remainingResult);

      // Delete auth data directly via adapter to avoid mutation timeout.
      // Each call is a separate mutation, keeping them within the time limit.
      for (const model of ["session", "account", "twoFactor"] as const) {
        await ctx.runMutation(components.betterAuth.adapter.deleteMany, {
          input: { model, where: [{ field: "userId", value: user._id }] },
          paginationOpts: { cursor: null, numItems: 500 },
        });
      }

      await ctx.runMutation(components.betterAuth.adapter.deleteOne, {
        input: { model: "user", where: [{ field: "_id", value: user._id }] },
      });

      if (failedDocuments.length > 0) {
        throw new Error(
          `Account deleted but ${failedDocuments.length} document(s) failed to fully clean up`,
        );
      }
    } catch (error) {
      evt.setError(error);
      throw error;
    } finally {
      evt.emit();
    }

    return null;
  },
});
