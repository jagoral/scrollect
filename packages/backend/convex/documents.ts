import { ConvexError, v } from "convex/values";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { paginationOptsValidator } from "convex/server";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { enforceDocumentLimit, resolveTier } from "./entitlements";
import type { Tier } from "./entitlements";
import { formatFileSize, getFileSizeLimit } from "./lib/fileSizeLimits";
import { requireAuth, optionalAuth } from "./lib/functions";
import { WideEvent } from "./lib/logging";
import { rateLimiter, tieredLimiterName } from "./lib/rateLimitConfig";
import { documentStatus, failedAtStage, fileType, urlFileType } from "./lib/validators";

async function enforceFileSizeLimit(
  ctx: MutationCtx,
  args: { storageId: Id<"_storage">; fileType: string; tier: Tier; evt: WideEvent },
) {
  const limit = getFileSizeLimit(args.fileType, args.tier);
  if (!limit) {
    throw new Error(`No file size limit configured for type: ${args.fileType}`);
  }
  const metadata = await ctx.db.system.get(args.storageId);
  if (!metadata) return;
  args.evt.set("fileSize", metadata.size);
  if (metadata.size > limit) {
    // Storage deletion is NOT transactional (persists even if mutation rolls back).
    // This must be called BEFORE db.insert to avoid orphaned document rows.
    await ctx.storage.delete(args.storageId);
    args.evt.set({ fileTooLarge: true, maxSize: limit, tier: args.tier });
    throw new ConvexError({
      kind: "FileTooLarge" as const,
      fileSize: metadata.size,
      maxSize: limit,
      maxSizeFormatted: formatFileSize(limit),
      fileSizeFormatted: formatFileSize(metadata.size),
      tier: args.tier,
    });
  }
}

async function enforceDocumentUploadLimit(
  ctx: MutationCtx,
  userId: string,
  evt: WideEvent,
): Promise<Tier> {
  // `enforceDocumentLimit` already reads the Polar subscription to compute the tier;
  // reuse its result so we don't fetch it twice per upload.
  const tier: Tier = await enforceDocumentLimit(ctx, userId);
  evt.set("tier", tier);
  const name = tieredLimiterName("documentUpload", tier);
  const result = await rateLimiter.limit(ctx, name, { key: userId });
  if (!result.ok) {
    evt.set({ rateLimited: true, endpoint: name, retryAfterMs: result.retryAfter });
    throw new ConvexError({
      kind: "RateLimited" as const,
      name: "documentUpload",
      retryAfter: result.retryAfter,
    });
  }
  return tier;
}

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuth(ctx);
    const tier = await resolveTier(ctx, user._id);
    const name = tieredLimiterName("uploadUrlGeneration", tier);
    const result = await rateLimiter.limit(ctx, name, { key: user._id });
    if (!result.ok) {
      throw new ConvexError({
        kind: "RateLimited" as const,
        name: "uploadUrlGeneration",
        retryAfter: result.retryAfter,
      });
    }
    return await ctx.storage.generateUploadUrl();
  },
});

export const create = mutation({
  args: {
    title: v.string(),
    fileType,
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const evt = new WideEvent("documents.create");
    evt.set({ fileType: args.fileType, title: args.title });
    try {
      const user = await requireAuth(ctx);
      evt.set("userId", user._id);
      const tier = await enforceDocumentUploadLimit(ctx, user._id, evt);
      await enforceFileSizeLimit(ctx, {
        storageId: args.storageId,
        fileType: args.fileType,
        tier,
        evt,
      });
      const documentId = await ctx.db.insert("documents", {
        title: args.title,
        fileType: args.fileType,
        storageId: args.storageId,
        status: "uploaded",
        chunkCount: 0,
        userId: user._id,
        createdAt: Date.now(),
      });
      evt.set("documentId", documentId);
      await ctx.scheduler.runAfter(0, internal.pipeline.index.startProcessing, {
        documentId,
      });
      return documentId;
    } catch (error) {
      evt.setError(error);
      throw error;
    } finally {
      evt.emit();
    }
  },
});

export const createFromUrl = mutation({
  args: {
    url: v.string(),
    fileType: urlFileType,
    title: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const evt = new WideEvent("documents.createFromUrl");
    evt.set({ fileType: args.fileType, url: args.url });
    try {
      const user = await requireAuth(ctx);
      evt.set("userId", user._id);
      await enforceDocumentUploadLimit(ctx, user._id, evt);

      const parsed = new URL(args.url);
      if (!["http:", "https:"].includes(parsed.protocol)) {
        throw new Error("Only HTTP and HTTPS URLs are supported");
      }
      if (
        parsed.hostname === "localhost" ||
        parsed.hostname.startsWith("127.") ||
        parsed.hostname === "[::1]"
      ) {
        throw new Error("Local URLs are not allowed");
      }

      const documentId = await ctx.db.insert("documents", {
        title: args.title ?? args.url,
        fileType: args.fileType,
        sourceUrl: args.url,
        status: "uploaded",
        chunkCount: 0,
        userId: user._id,
        createdAt: Date.now(),
      });
      evt.set("documentId", documentId);
      await ctx.scheduler.runAfter(0, internal.pipeline.index.startProcessing, {
        documentId,
      });
      return documentId;
    } catch (error) {
      evt.setError(error);
      throw error;
    } finally {
      evt.emit();
    }
  },
});

export const createFromText = mutation({
  args: {
    title: v.string(),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const evt = new WideEvent("documents.createFromText");
    evt.set({ title: args.title });
    try {
      const user = await requireAuth(ctx);
      evt.set("userId", user._id);
      const tier = await enforceDocumentUploadLimit(ctx, user._id, evt);
      await enforceFileSizeLimit(ctx, {
        storageId: args.storageId,
        fileType: "text",
        tier,
        evt,
      });
      const documentId = await ctx.db.insert("documents", {
        title: args.title,
        fileType: "text",
        storageId: args.storageId,
        status: "uploaded",
        chunkCount: 0,
        userId: user._id,
        createdAt: Date.now(),
      });
      evt.set("documentId", documentId);
      await ctx.scheduler.runAfter(0, internal.pipeline.index.startProcessing, {
        documentId,
      });
      return documentId;
    } catch (error) {
      evt.setError(error);
      throw error;
    } finally {
      evt.emit();
    }
  },
});

const LEARNING_GOAL_MAX_LENGTH = 500;

export const updateLearningGoal = mutation({
  args: {
    id: v.id("documents"),
    learningGoal: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const evt = new WideEvent("documents.updateLearningGoal");
    evt.set("documentId", args.id);
    try {
      const user = await requireAuth(ctx);
      evt.set("userId", user._id);
      const doc = await ctx.db.get(args.id);
      if (!doc || doc.userId !== user._id) {
        throw new Error("Document not found");
      }
      const trimmed = args.learningGoal.trim();
      if (trimmed.length === 0) {
        throw new Error("Learning goal cannot be empty");
      }
      if (trimmed.length > LEARNING_GOAL_MAX_LENGTH) {
        throw new Error(`Learning goal must be at most ${LEARNING_GOAL_MAX_LENGTH} characters`);
      }
      await ctx.db.patch(args.id, { learningGoal: trimmed });
      return null;
    } catch (error) {
      evt.setError(error);
      throw error;
    } finally {
      evt.emit();
    }
  },
});

export const clearLearningGoal = mutation({
  args: {
    id: v.id("documents"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const evt = new WideEvent("documents.clearLearningGoal");
    evt.set("documentId", args.id);
    try {
      const user = await requireAuth(ctx);
      evt.set("userId", user._id);
      const doc = await ctx.db.get(args.id);
      if (!doc || doc.userId !== user._id) {
        throw new Error("Document not found");
      }
      await ctx.db.patch(args.id, { learningGoal: undefined });
      return null;
    } catch (error) {
      evt.setError(error);
      throw error;
    } finally {
      evt.emit();
    }
  },
});

export const updateTitle = internalMutation({
  args: {
    id: v.id("documents"),
    title: v.string(),
    thumbnailUrl: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      title: args.title,
      ...(args.thumbnailUrl !== undefined ? { thumbnailUrl: args.thumbnailUrl } : {}),
    });
    return null;
  },
});

export const list = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const user = await optionalAuth(ctx);
    if (!user) {
      return {
        page: [],
        isDone: true,
        continueCursor: "",
      };
    }
    return await ctx.db
      .query("documents")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

export const get = query({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    const user = await optionalAuth(ctx);
    if (!user) return null;
    const doc = await ctx.db.get(args.id);
    if (!doc || doc.userId !== user._id) return null;
    return doc;
  },
});

export const updateStatus = internalMutation({
  args: {
    id: v.id("documents"),
    status: documentStatus,
    errorMessage: v.optional(v.string()),
    chunkCount: v.optional(v.number()),
    failedAt: v.optional(failedAtStage),
    language: v.optional(v.string()),
    summary: v.optional(v.string()),
    summaryEmbeddingId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, ...fields } = args;
    const update: Record<string, unknown> = { status: fields.status };
    if (fields.status === "error") {
      update.errorMessage = fields.errorMessage;
      update.failedAt = fields.failedAt;
    } else {
      update.errorMessage = undefined;
      update.failedAt = undefined;
    }
    if (fields.chunkCount !== undefined) {
      update.chunkCount = fields.chunkCount;
    }
    if (fields.language !== undefined) {
      update.language = fields.language;
    }
    if (fields.summary !== undefined) {
      update.summary = fields.summary;
    }
    if (fields.summaryEmbeddingId !== undefined) {
      update.summaryEmbeddingId = fields.summaryEmbeddingId;
    }
    await ctx.db.patch(id, update);
  },
});

export const setRunpodJobId = internalMutation({
  args: {
    id: v.id("documents"),
    jobId: v.string(),
    submittedAt: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      runpodJobId: args.jobId,
      runpodSubmittedAt: args.submittedAt,
    });
  },
});

export const getInternal = internalQuery({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const listReadyByUser = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("documents")
      .withIndex("by_userId_status", (q) => q.eq("userId", args.userId).eq("status", "ready"))
      .collect();
  },
});

export const getDocumentDeletionData = internalQuery({
  args: { documentId: v.id("documents") },
  returns: v.union(
    v.object({
      document: v.object({
        _id: v.id("documents"),
        userId: v.string(),
        storageId: v.optional(v.id("_storage")),
        summaryEmbeddingId: v.optional(v.string()),
      }),
      chunkEmbeddingIds: v.array(v.string()),
      sectionSummaryEmbeddingIds: v.array(v.string()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const document = await ctx.db.get(args.documentId);
    if (!document) return null;

    const chunks = await ctx.db
      .query("chunks")
      .withIndex("by_documentId", (q) => q.eq("documentId", args.documentId))
      .collect();

    const chunkEmbeddingIds = chunks
      .map((c) => c.embeddingId)
      .filter((id): id is string => id !== undefined);

    const sectionSummaries = await ctx.db
      .query("sectionSummaries")
      .withIndex("by_documentId", (q) => q.eq("documentId", args.documentId))
      .collect();

    const sectionSummaryEmbeddingIds = sectionSummaries.map((s) => s.embeddingId);

    return {
      document: {
        _id: document._id,
        userId: document.userId,
        storageId: document.storageId,
        summaryEmbeddingId: document.summaryEmbeddingId,
      },
      chunkEmbeddingIds,
      sectionSummaryEmbeddingIds,
    };
  },
});

export const cascadeDeletePosts = internalMutation({
  args: {
    documentId: v.id("documents"),
    userId: v.string(),
  },
  returns: v.object({
    deletedPosts: v.number(),
    deletedBookmarks: v.number(),
  }),
  handler: async (ctx, args) => {
    const evt = new WideEvent("documents.cascadeDeletePosts");
    evt.set("documentId", args.documentId);
    const docCheck = await ctx.db.get(args.documentId);
    if (!docCheck) {
      evt.set("skipped", true);
      evt.emit();
      return { deletedPosts: 0, deletedBookmarks: 0 };
    }

    const posts = await ctx.db
      .query("posts")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();

    const documentPosts = posts.filter((p) => p.primarySourceDocumentId === args.documentId);

    let deletedPosts = 0;
    let deletedBookmarks = 0;

    for (const post of documentPosts) {
      const bookmarks = await ctx.db
        .query("bookmarks")
        .withIndex("by_userId_post", (q) => q.eq("userId", args.userId).eq("postId", post._id))
        .collect();

      for (const bookmark of bookmarks) {
        await ctx.db.delete(bookmark._id);
        deletedBookmarks++;
      }

      if (post.assetStorageId) {
        try {
          await ctx.storage.delete(post.assetStorageId);
        } catch (error) {
          evt.set({
            warning: "post_asset_storage_delete_failed",
            failedPostId: post._id,
            storageDeleteError: error instanceof Error ? error.message : String(error),
          });
        }
      }

      await ctx.db.delete(post._id);
      deletedPosts++;
    }

    evt.set({ deletedPosts, deletedBookmarks });
    evt.emit();
    return { deletedPosts, deletedBookmarks };
  },
});

export const cascadeDeleteChunksAndSummaries = internalMutation({
  args: { documentId: v.id("documents"), userId: v.optional(v.string()) },
  returns: v.object({
    deletedChunks: v.number(),
    deletedSectionSummaries: v.number(),
    deletedProcessingJobs: v.number(),
    deletedCardDrafts: v.number(),
    deletedReactionFeedback: v.number(),
  }),
  handler: async (ctx, args) => {
    const chunks = await ctx.db
      .query("chunks")
      .withIndex("by_documentId", (q) => q.eq("documentId", args.documentId))
      .collect();
    for (const chunk of chunks) {
      await ctx.db.delete(chunk._id);
    }

    const sectionSummaries = await ctx.db
      .query("sectionSummaries")
      .withIndex("by_documentId", (q) => q.eq("documentId", args.documentId))
      .collect();
    for (const ss of sectionSummaries) {
      await ctx.db.delete(ss._id);
    }

    const processingJobs = await ctx.db
      .query("processingJobs")
      .withIndex("by_documentId", (q) => q.eq("documentId", args.documentId))
      .collect();
    for (const job of processingJobs) {
      await ctx.db.delete(job._id);
    }

    const cardDrafts = await ctx.db
      .query("cardDrafts")
      .withIndex("by_documentId", (q) => q.eq("documentId", args.documentId))
      .collect();

    let deletedReactionFeedback = 0;
    if (cardDrafts.length > 0 && args.userId) {
      const userId = args.userId;
      const cardDraftIds = new Set(cardDrafts.map((d) => d._id as string));
      const feedbackRows = await ctx.db
        .query("reactionFeedback")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .collect();
      for (const fb of feedbackRows) {
        if (cardDraftIds.has(fb.cardDraftId as string)) {
          await ctx.db.delete(fb._id);
          deletedReactionFeedback++;
        }
      }
    }

    for (const draft of cardDrafts) {
      await ctx.db.delete(draft._id);
    }

    return {
      deletedChunks: chunks.length,
      deletedSectionSummaries: sectionSummaries.length,
      deletedProcessingJobs: processingJobs.length,
      deletedCardDrafts: cardDrafts.length,
      deletedReactionFeedback,
    };
  },
});

export const cascadeDeleteDocument = internalMutation({
  args: { documentId: v.id("documents") },
  returns: v.object({
    deletedOrphanedTags: v.number(),
  }),
  handler: async (ctx, args) => {
    const evt = new WideEvent("documents.cascadeDeleteDocument");
    evt.set("documentId", args.documentId);
    const document = await ctx.db.get(args.documentId);
    if (!document) {
      evt.set("skipped", true);
      evt.emit();
      return { deletedOrphanedTags: 0 };
    }

    if (document.storageId) {
      try {
        await ctx.storage.delete(document.storageId);
      } catch (error) {
        evt.set({
          warning: "document_storage_delete_failed",
          storageDeleteError: error instanceof Error ? error.message : String(error),
        });
      }
    }

    let deletedOrphanedTags = 0;
    if (document.tagIds && document.tagIds.length > 0) {
      const userDocs = await ctx.db
        .query("documents")
        .withIndex("by_userId", (q) => q.eq("userId", document.userId))
        .collect();
      for (const tagId of document.tagIds) {
        const isUsedElsewhere = userDocs.some(
          (d) => d._id !== args.documentId && d.tagIds?.includes(tagId),
        );
        if (!isUsedElsewhere) {
          const tag = await ctx.db.get(tagId);
          if (tag) {
            await ctx.db.delete(tagId);
            deletedOrphanedTags++;
          }
        }
      }
    }

    await ctx.db.delete(args.documentId);

    evt.set({ deletedOrphanedTags, tagCount: document.tagIds?.length ?? 0 });
    evt.emit();
    return { deletedOrphanedTags };
  },
});

export const retry = mutation({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    const evt = new WideEvent("documents.retry");
    evt.set("documentId", args.id);
    try {
      const user = await requireAuth(ctx);
      const doc = await ctx.db.get(args.id);
      if (!doc || doc.userId !== user._id) {
        throw new Error("Document not found");
      }
      if (doc.status !== "error") {
        throw new Error("Document is not in error state");
      }
      evt.set({ previousStatus: doc.status, failedAt: doc.failedAt });
      await ctx.db.patch(args.id, { errorMessage: undefined });
      await ctx.scheduler.runAfter(0, internal.pipeline.resume.resumeProcessing, {
        documentId: args.id,
      });
    } catch (error) {
      evt.setError(error);
      throw error;
    } finally {
      evt.emit();
    }
  },
});
