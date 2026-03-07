import type { GenericCtx } from "@convex-dev/better-auth";
import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { internalMutation, mutation, query } from "./_generated/server";
import { authComponent } from "./auth";

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
    const user = await authComponent.safeGetAuthUser(ctx as unknown as GenericCtx<DataModel>);
    if (!user) {
      throw new Error("Not authenticated");
    }
    const documentId = await ctx.db.insert("documents", {
      title: args.title,
      fileType: args.fileType,
      storageId: args.storageId,
      status: "pending",
      chunkCount: 0,
      userId: user._id,
      createdAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.processing.processDocument, {
      documentId,
    });
    return documentId;
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
      v.literal("pending"),
      v.literal("processing"),
      v.literal("ready"),
      v.literal("error"),
    ),
    errorMessage: v.optional(v.string()),
    chunkCount: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { id, ...fields } = args;
    const update: Record<string, unknown> = { status: fields.status };
    if (fields.errorMessage !== undefined) {
      update.errorMessage = fields.errorMessage;
    }
    if (fields.chunkCount !== undefined) {
      update.chunkCount = fields.chunkCount;
    }
    await ctx.db.patch(id, update);
  },
});
