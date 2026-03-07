import type { GenericCtx } from "@convex-dev/better-auth";
import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { authComponent } from "./auth";
import { WideEvent } from "./logging";

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await authComponent.safeGetAuthUser(ctx as unknown as GenericCtx<DataModel>);
    if (!user) {
      throw new Error("Not authenticated");
    }
    return await ctx.storage.generateUploadUrl();
  },
});

export const create = mutation({
  args: {
    title: v.string(),
    fileType: v.union(v.literal("pdf"), v.literal("md")),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const evt = new WideEvent("documents.create");
    evt.set({ fileType: args.fileType, title: args.title });
    try {
      const user = await authComponent.safeGetAuthUser(ctx as unknown as GenericCtx<DataModel>);
      if (!user) {
        throw new Error("Not authenticated");
      }
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
      await ctx.scheduler.runAfter(0, internal.pipeline.startProcessing, {
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

export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await authComponent.safeGetAuthUser(ctx as unknown as GenericCtx<DataModel>);
    if (!user) {
      return [];
    }
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
    const user = await authComponent.safeGetAuthUser(ctx as unknown as GenericCtx<DataModel>);
    if (!user) {
      return null;
    }
    const doc = await ctx.db.get(args.id);
    if (!doc || doc.userId !== user._id) {
      return null;
    }
    return doc;
  },
});

export const updateStatus = internalMutation({
  args: {
    id: v.id("documents"),
    status: v.union(
      v.literal("uploaded"),
      v.literal("parsing"),
      v.literal("chunking"),
      v.literal("embedding"),
      v.literal("ready"),
      v.literal("error"),
    ),
    errorMessage: v.optional(v.string()),
    chunkCount: v.optional(v.number()),
    failedAt: v.optional(
      v.union(v.literal("parsing"), v.literal("chunking"), v.literal("embedding")),
    ),
  },
  handler: async (ctx, args) => {
    const { id, ...fields } = args;
    const update: Record<string, unknown> = { status: fields.status };
    if (fields.status === "error") {
      update.errorMessage = fields.errorMessage;
      update.failedAt = fields.failedAt;
    } else {
      // Clear error fields on non-error status transitions
      update.errorMessage = undefined;
      update.failedAt = undefined;
    }
    if (fields.chunkCount !== undefined) {
      update.chunkCount = fields.chunkCount;
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
      const user = await authComponent.safeGetAuthUser(ctx as unknown as GenericCtx<DataModel>);
      if (!user) {
        throw new Error("Not authenticated");
      }
      const doc = await ctx.db.get(args.id);
      if (!doc || doc.userId !== user._id) {
        throw new Error("Document not found");
      }
      if (doc.status !== "error") {
        throw new Error("Document is not in error state");
      }
      evt.set({ previousStatus: doc.status, failedAt: doc.failedAt });
      await ctx.db.patch(args.id, { errorMessage: undefined });
      await ctx.scheduler.runAfter(0, internal.pipeline.resumeProcessing, {
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
