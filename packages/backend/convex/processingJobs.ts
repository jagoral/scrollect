import { v } from "convex/values";

import { internalMutation, internalQuery } from "./_generated/server";

export const create = internalMutation({
  args: {
    documentId: v.id("documents"),
    totalBatches: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("processingJobs", {
      documentId: args.documentId,
      totalBatches: args.totalBatches,
      completedBatches: 0,
      failedBatches: 0,
      retryCount: 0,
      createdAt: Date.now(),
    });
  },
});

export const markBatchComplete = internalMutation({
  args: {
    id: v.id("processingJobs"),
    failed: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.id);
    if (!job) {
      throw new Error(`Processing job ${args.id} not found`);
    }
    const update = args.failed
      ? { failedBatches: job.failedBatches + 1 }
      : { completedBatches: job.completedBatches + 1 };
    await ctx.db.patch(args.id, update);
    return {
      ...job,
      ...update,
    };
  },
});

export const getByDocument = internalQuery({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("processingJobs")
      .withIndex("by_documentId", (q) => q.eq("documentId", args.documentId))
      .order("desc")
      .first();
  },
});

export const get = internalQuery({
  args: { id: v.id("processingJobs") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});
