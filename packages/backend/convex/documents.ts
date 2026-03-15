import { v } from "convex/values";

import { internal } from "./_generated/api";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { requireAuth, optionalAuth } from "./lib/functions";
import { WideEvent } from "./lib/logging";
import { documentStatus, failedAtStage, fileType, urlFileType } from "./lib/validators";

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);
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

      const user = await requireAuth(ctx);
      evt.set("userId", user._id);
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

export const updateTitle = internalMutation({
  args: {
    id: v.id("documents"),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { title: args.title });
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await optionalAuth(ctx);
    if (!user) return [];
    return await ctx.db
      .query("documents")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .order("desc")
      .collect();
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
    if (fields.summary !== undefined) {
      update.summary = fields.summary;
    }
    if (fields.summaryEmbeddingId !== undefined) {
      update.summaryEmbeddingId = fields.summaryEmbeddingId;
    }
    await ctx.db.patch(id, update);
  },
});

export const setDatalabCheckUrl = internalMutation({
  args: {
    id: v.id("documents"),
    checkUrl: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { datalabCheckUrl: args.checkUrl });
  },
});

export const getInternal = internalQuery({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
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
    deletedPostSources: v.number(),
    deletedBookmarks: v.number(),
  }),
  handler: async (ctx, args) => {
    const docCheck = await ctx.db.get(args.documentId);
    if (!docCheck) return { deletedPosts: 0, deletedPostSources: 0, deletedBookmarks: 0 };

    const postSources = await ctx.db
      .query("postSources")
      .withIndex("by_documentId", (q) => q.eq("documentId", args.documentId))
      .collect();

    const postIds = [...new Set(postSources.map((ps) => ps.postId))];

    for (const ps of postSources) {
      await ctx.db.delete(ps._id);
    }

    let deletedPosts = 0;
    let deletedBookmarks = 0;
    let additionalPostSources = 0;

    for (const postId of postIds) {
      const post = await ctx.db.get(postId);
      if (!post) continue;

      if (post.primarySourceDocumentId === args.documentId) {
        const remainingPostSources = await ctx.db
          .query("postSources")
          .withIndex("by_postId", (q) => q.eq("postId", postId))
          .collect();

        for (const rps of remainingPostSources) {
          await ctx.db.delete(rps._id);
          additionalPostSources++;
        }

        const bookmarks = await ctx.db
          .query("bookmarks")
          .withIndex("by_userId_post", (q) => q.eq("userId", args.userId).eq("postId", postId))
          .collect();

        for (const bookmark of bookmarks) {
          await ctx.db.delete(bookmark._id);
          deletedBookmarks++;
        }

        if (post.assetStorageId) {
          try {
            await ctx.storage.delete(post.assetStorageId);
          } catch (error) {
            console.log(
              JSON.stringify({
                warning: "post_asset_storage_delete_failed",
                postId: postId,
                error: error instanceof Error ? error.message : String(error),
              }),
            );
          }
        }

        await ctx.db.delete(postId);
        deletedPosts++;
      }
    }

    return {
      deletedPosts,
      deletedPostSources: postSources.length + additionalPostSources,
      deletedBookmarks,
    };
  },
});

export const cascadeDeleteChunksAndSummaries = internalMutation({
  args: { documentId: v.id("documents") },
  returns: v.object({
    deletedChunks: v.number(),
    deletedSectionSummaries: v.number(),
    deletedProcessingJobs: v.number(),
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

    return {
      deletedChunks: chunks.length,
      deletedSectionSummaries: sectionSummaries.length,
      deletedProcessingJobs: processingJobs.length,
    };
  },
});

export const cascadeDeleteDocument = internalMutation({
  args: { documentId: v.id("documents") },
  returns: v.object({
    deletedOrphanedTags: v.number(),
  }),
  handler: async (ctx, args) => {
    const document = await ctx.db.get(args.documentId);
    if (!document) return { deletedOrphanedTags: 0 };

    if (document.storageId) {
      try {
        await ctx.storage.delete(document.storageId);
      } catch (error) {
        console.log(
          JSON.stringify({
            warning: "document_storage_delete_failed",
            documentId: args.documentId,
            error: error instanceof Error ? error.message : String(error),
          }),
        );
      }
    }

    let deletedOrphanedTags = 0;
    if (document.tagIds && document.tagIds.length > 0) {
      for (const tagId of document.tagIds) {
        const otherDocs = await ctx.db
          .query("documents")
          .withIndex("by_userId", (q) => q.eq("userId", document.userId))
          .collect();
        const isUsedElsewhere = otherDocs.some(
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
