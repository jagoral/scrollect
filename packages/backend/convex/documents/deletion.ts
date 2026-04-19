"use node";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { deleteDocumentVectors } from "../../src/logic/documentDeletion";
import type { VectorDeletionServices } from "../../src/providers/types";
import { createVectorDeletionServices } from "../pipeline/services";

export type DocumentDeletionData = {
  document: {
    _id: Id<"documents">;
    userId: string;
    storageId?: Id<"_storage">;
    summaryEmbeddingId?: string;
  };
  chunkEmbeddingIds: string[];
  sectionSummaryEmbeddingIds: string[];
};

export type DocumentDeletionCascadeResult = {
  chunkVectorCount: number;
  summaryVectorCount: number;
  deleted: {
    highlights: number;
    posts: number;
    bookmarks: number;
    connectionPairs: number;
    chunks: number;
    sectionSummaries: number;
    processingJobs: number;
    cardDrafts: number;
    reactionFeedback: number;
    orphanedTags: number;
  };
};

type DocumentDeletionCascadeCtx = Pick<ActionCtx, "runMutation">;

export async function markDocumentDeletionFailed({
  ctx,
  documentId,
  error,
}: {
  ctx: DocumentDeletionCascadeCtx;
  documentId: Id<"documents">;
  error: unknown;
}): Promise<{ recoveryError?: string }> {
  try {
    await ctx.runMutation(internal.documents.updateStatus, {
      id: documentId,
      status: "error",
      failedAt: "deleting",
      errorMessage: error instanceof Error ? error.message : "Unknown error",
    });
    return {};
  } catch (recoveryError) {
    // The document may already be gone if row cleanup completed before another step failed.
    return { recoveryError: String(recoveryError) };
  }
}

export async function executeDocumentDeletionCascade({
  ctx,
  documentId,
  userId,
  data,
  services = createVectorDeletionServices(),
}: {
  ctx: DocumentDeletionCascadeCtx;
  documentId: Id<"documents">;
  userId: string;
  data: DocumentDeletionData;
  services?: VectorDeletionServices;
}): Promise<DocumentDeletionCascadeResult> {
  await ctx.runMutation(internal.documents.updateStatus, {
    id: documentId,
    status: "deleting",
  });

  const vectorDeletion = await deleteDocumentVectors({
    input: {
      chunkEmbeddingIds: data.chunkEmbeddingIds,
      sectionSummaryEmbeddingIds: data.sectionSummaryEmbeddingIds,
      documentSummaryEmbeddingId: data.document.summaryEmbeddingId,
    },
    services,
  });

  const [highlightResult, postResult, connectionPairResult] = await Promise.all([
    ctx.runMutation(internal.highlights.cascadeDeleteHighlights, {
      documentId,
      userId,
    }),
    ctx.runMutation(internal.documents.cascadeDeletePosts, {
      documentId,
      userId,
    }),
    ctx.runMutation(internal.connectionPairs.cascadeDeleteByDocumentId, {
      documentId,
    }),
  ]);

  const chunkResult = await ctx.runMutation(internal.documents.cascadeDeleteChunksAndSummaries, {
    documentId,
    userId,
  });

  const docResult = await ctx.runMutation(internal.documents.cascadeDeleteDocument, {
    documentId,
  });

  return {
    chunkVectorCount: vectorDeletion.deletedChunkVectorCount,
    summaryVectorCount: vectorDeletion.deletedSummaryVectorCount,
    deleted: {
      highlights: highlightResult.deletedHighlights,
      posts: postResult.deletedPosts,
      bookmarks: postResult.deletedBookmarks,
      connectionPairs: connectionPairResult.deletedConnectionPairs,
      chunks: chunkResult.deletedChunks,
      sectionSummaries: chunkResult.deletedSectionSummaries,
      processingJobs: chunkResult.deletedProcessingJobs,
      cardDrafts: chunkResult.deletedCardDrafts,
      reactionFeedback: chunkResult.deletedReactionFeedback,
      orphanedTags: docResult.deletedOrphanedTags,
    },
  };
}
