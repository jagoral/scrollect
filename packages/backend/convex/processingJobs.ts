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
    if (args.failed) {
      await ctx.db.patch(args.id, {
        failedBatches: job.failedBatches + 1,
      });
    } else {
      await ctx.db.patch(args.id, {
        completedBatches: job.completedBatches + 1,
      });
    }
  },
});

export const get = internalQuery({
  args: { id: v.id("processingJobs") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});
