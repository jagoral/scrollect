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
