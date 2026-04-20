"use node";

import { v } from "convex/values";

import type { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import type { ActionCtx } from "../_generated/server";
import { action, internalAction } from "../_generated/server";
import { requireAuth } from "../lib/functions";
import { WideEvent } from "../../src/platform/logging";
import { createEmbeddingProvider } from "../../src/providers/wiring";
import { executeDocumentDeletionCascade, markDocumentDeletionFailed } from "./deletion";

async function captureDeletionFailure(
  ctx: ActionCtx,
  opts: { documentId: Id<"documents">; error: unknown; evt: WideEvent },
) {
  const recovery = await markDocumentDeletionFailed({
    ctx,
    documentId: opts.documentId,
    error: opts.error,
  });
  if (recovery.recoveryError) {
    opts.evt.set("recoveryError", recovery.recoveryError);
  }
}

export const deleteDocument = action({
  args: { documentId: v.id("documents") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const evt = new WideEvent("documentActions.deleteDocument");
    evt.set({ documentId: args.documentId });

    try {
      const user = await requireAuth(ctx);
      evt.set("userId", user._id);

      const data = await ctx.runQuery(internal.content.documents.getDocumentDeletionData, {
        documentId: args.documentId,
      });

      if (!data || data.document.userId !== user._id) {
        throw new Error("Document not found");
      }

      const deletionResult = await executeDocumentDeletionCascade({
        ctx,
        documentId: args.documentId,
        userId: user._id,
        data,
      });
      evt.set(deletionResult);
    } catch (error) {
      evt.setError(error);
      await captureDeletionFailure(ctx, { documentId: args.documentId, error, evt });
      throw error;
    } finally {
      evt.emit();
    }

    return null;
  },
});

/**
 * Embeds a document's learning goal and patches `documents.learningGoalEmbedding`. The
 * embedding model is the same one used for section summaries (see `pipeline/helpers.ts`)
 * so serving-time cosine similarity between the goal vector and section vectors is
 * meaningful.
 *
 * Missing / empty goal, embedding failure, or provider misconfiguration all no-op instead
 * of throwing. Goal relevance at serve time defaults to 1.0 when the embedding is absent,
 * so failing open here preserves ranking correctness.
 */
export const embedLearningGoal = internalAction({
  args: {
    documentId: v.id("documents"),
    learningGoal: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const evt = new WideEvent("documentActions.embedLearningGoal");
    evt.set("documentId", args.documentId);
    try {
      const trimmed = args.learningGoal.trim();
      if (trimmed.length === 0) {
        evt.set("skipped", "empty_goal");
        return null;
      }

      const embedder = createEmbeddingProvider();
      const [vector] = await embedder.embed([trimmed]);
      if (!vector || vector.length === 0) {
        evt.set("skipped", "empty_vector");
        return null;
      }

      await ctx.runMutation(internal.content.documents.setLearningGoalEmbedding, {
        id: args.documentId,
        embedding: vector,
      });
      evt.set({ embeddingDimensions: vector.length });
      return null;
    } catch (error) {
      evt.setError(error);
      return null;
    } finally {
      evt.emit();
    }
  },
});

// Ownership was validated by the original deleteDocument call. This internal action
// is only reachable via resumeProcessing (scheduler) and trusts that the documentId
// refers to a legitimately user-owned document that previously failed deletion.
export const retryDeleteDocument = internalAction({
  args: { documentId: v.id("documents") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const evt = new WideEvent("documentActions.retryDeleteDocument");
    evt.set({ documentId: args.documentId });

    try {
      const data = await ctx.runQuery(internal.content.documents.getDocumentDeletionData, {
        documentId: args.documentId,
      });

      if (!data) {
        throw new Error("Document not found");
      }

      const deletionResult = await executeDocumentDeletionCascade({
        ctx,
        documentId: args.documentId,
        userId: data.document.userId,
        data,
      });
      evt.set(deletionResult);
    } catch (error) {
      evt.setError(error);
      await captureDeletionFailure(ctx, { documentId: args.documentId, error, evt });
      throw error;
    } finally {
      evt.emit();
    }

    return null;
  },
});
