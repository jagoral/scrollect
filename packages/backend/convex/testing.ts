import type { GenericCtx } from "@convex-dev/better-auth";
import { v } from "convex/values";

import type { DataModel } from "./_generated/dataModel";
import { mutation } from "./_generated/server";
import { authComponent } from "./auth";

const E2E_EMAIL_PATTERN = /^e2e-.*@test\.scrollect\.dev$/;

/**
 * Deletes all data created by the current authenticated user.
 * SAFETY: Only works for users whose email matches the E2E test pattern.
 */
export const cleanupCurrentUser = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await authComponent.safeGetAuthUser(ctx as unknown as GenericCtx<DataModel>);
    if (!user) {
      throw new Error("Not authenticated");
    }

    if (!user.email || !E2E_EMAIL_PATTERN.test(user.email)) {
      throw new Error(`Cleanup refused: email "${user.email}" does not match E2E test pattern`);
    }

    const userId = user._id;

    // 1. Find all documents for this user
    const documents = await ctx.db
      .query("documents")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();

    // 2. For each document, delete chunks, processingJobs, and storage
    for (const doc of documents) {
      const chunks = await ctx.db
        .query("chunks")
        .withIndex("by_documentId", (q) => q.eq("documentId", doc._id))
        .collect();
      for (const chunk of chunks) {
        await ctx.db.delete(chunk._id);
      }

      const jobs = await ctx.db
        .query("processingJobs")
        .withIndex("by_documentId", (q) => q.eq("documentId", doc._id))
        .collect();
      for (const job of jobs) {
        await ctx.db.delete(job._id);
      }

      // Delete the stored file
      await ctx.storage.delete(doc.storageId);
      await ctx.db.delete(doc._id);
    }

    // 3. Delete all posts for this user
    const posts = await ctx.db
      .query("posts")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();
    for (const post of posts) {
      if (post.assetStorageId) {
        await ctx.storage.delete(post.assetStorageId);
      }
      await ctx.db.delete(post._id);
    }

    return { deleted: { documents: documents.length, posts: posts.length } };
  },
});
