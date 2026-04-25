"use node";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { deleteDocumentVectors } from "../../src/content/documentDeletion";
import type { VectorDeletionServices } from "../../src/providers/types";
import { createSummaryVectorStore, createVectorStore } from "../../src/providers/wiring";

function createVectorDeletionServices(): VectorDeletionServices {
  return {
    vectorStore: createVectorStore(),
    summaryStore: createSummaryVectorStore(),
  };
}

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
    postDrafts: number;
    reactionFeedback: number;
    orphanedTags: number;
    documentTopics: number;
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
    await ctx.runMutation(internal.content.documents.updateStatus, {
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
  await ctx.runMutation(internal.content.documents.updateStatus, {
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

  const [highlightResult, postResult, connectionPairResult, topicResult] = await Promise.all([
    ctx.runMutation(internal.content.highlights.cascadeDeleteHighlights, {
      documentId,
      userId,
    }),
    ctx.runMutation(internal.content.documents.cascadeDeletePosts, {
      documentId,
      userId,
    }),
    ctx.runMutation(internal.drafting.connectionPairs.cascadeDeleteByDocumentId, {
      documentId,
    }),
    ctx.runMutation(internal.topics.topics.cascadeDeleteByDocumentId, {
      documentId,
    }),
  ]);

  const chunkResult = await ctx.runMutation(
    internal.content.documents.cascadeDeleteChunksAndSummaries,
    {
      documentId,
      userId,
    },
  );

  const docResult = await ctx.runMutation(internal.content.documents.cascadeDeleteDocument, {
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
      postDrafts: chunkResult.deletedPostDrafts,
      reactionFeedback: chunkResult.deletedReactionFeedback,
      orphanedTags: docResult.deletedOrphanedTags,
      documentTopics: topicResult.deletedDocumentTopics,
    },
  };
}
