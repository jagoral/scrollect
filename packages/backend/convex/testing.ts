import { v } from "convex/values";

import { internalMutation, internalQuery, mutation } from "./_generated/server";
import { requireAuth } from "./lib/functions";

const E2E_EMAIL_PATTERN = /^e2e-.*@test\.scrollect\.dev$/;

export const cleanupCurrentUser = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuth(ctx);

    if (!user.email || !E2E_EMAIL_PATTERN.test(user.email)) {
      throw new Error(`Cleanup refused: email "${user.email}" does not match E2E test pattern`);
    }

    const userId = user._id;

    // 0. Delete all bookmarks and bookmark lists for this user
    const bookmarks = await ctx.db
      .query("bookmarks")
      .withIndex("by_userId_post", (q) => q.eq("userId", userId))
      .collect();
    for (const bookmark of bookmarks) {
      await ctx.db.delete(bookmark._id);
    }

    const bookmarkLists = await ctx.db
      .query("bookmarkLists")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();
    for (const list of bookmarkLists) {
      await ctx.db.delete(list._id);
    }

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

    return {
      deleted: {
        bookmarks: bookmarks.length,
        bookmarkLists: bookmarkLists.length,
        documents: documents.length,
        posts: posts.length,
      },
    };
  },
});

export const countUserDocuments = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const docs = await ctx.db
      .query("documents")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();
    return docs.length;
  },
});

export const insertSeededData = internalMutation({
  args: {
    userId: v.string(),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const { userId, storageId } = args;
    const now = Date.now();

    // Create document
    const documentId = await ctx.db.insert("documents", {
      title: "E2E Seed Document",
      fileType: "md",
      storageId,
      status: "ready",
      chunkCount: 3,
      userId,
      createdAt: now,
    });

    // Create 3 chunks
    const chunkContents = [
      "Lorem ipsum is a placeholder text commonly used in the printing and typesetting industry. It has been the industry standard dummy text since the 1500s.",
      "Good UX design focuses on reducing cognitive load by breaking complex information into digestible chunks. Users process information better in smaller pieces.",
      "The observer pattern is a software design pattern that establishes a one-to-many dependency between objects, so when one object changes state, all its dependents are notified.",
    ];

    const chunkIds = [];
    for (let i = 0; i < chunkContents.length; i++) {
      const chunkId = await ctx.db.insert("chunks", {
        documentId,
        content: chunkContents[i]!,
        chunkIndex: i,
        tokenCount: 50,
        embedded: true,
        createdAt: now,
      });
      chunkIds.push(chunkId);
    }

    // Create 5 posts
    const postContents = [
      "**Key Insight:** Lorem ipsum is a placeholder text commonly used in design.",
      "**Design Principle:** Good UX reduces cognitive load with digestible chunks.",
      "**Software Pattern:** The observer pattern establishes one-to-many dependencies.",
      "**Learning Tip:** Spaced repetition improves long-term memory retention.",
      "**Architecture:** Event-driven systems decouple producers from consumers.",
    ];

    let postCount = 0;
    for (const content of postContents) {
      await ctx.db.insert("posts", {
        content,
        sourceChunkId: chunkIds[postCount % chunkIds.length]!,
        sourceDocumentId: documentId,
        userId,
        createdAt: now - (postContents.length - postCount) * 1000,
      });
      postCount++;
    }

    return { documentId, chunkCount: chunkIds.length, postCount };
  },
});

export const resetE2EAccount = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuth(ctx);

    if (!user.email || !E2E_EMAIL_PATTERN.test(user.email)) {
      throw new Error(`Reset refused: email "${user.email}" does not match E2E test pattern`);
    }

    const userId = user._id;

    // Clear all reactions on posts
    const posts = await ctx.db
      .query("posts")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();
    for (const post of posts) {
      await ctx.db.patch(post._id, { reaction: undefined });
    }

    // Delete all bookmarks
    const bookmarks = await ctx.db
      .query("bookmarks")
      .withIndex("by_userId_post", (q) => q.eq("userId", userId))
      .collect();
    for (const bookmark of bookmarks) {
      await ctx.db.delete(bookmark._id);
    }

    // Delete all bookmark lists
    const bookmarkLists = await ctx.db
      .query("bookmarkLists")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();
    for (const list of bookmarkLists) {
      await ctx.db.delete(list._id);
    }

    // Update newest post's createdAt to prevent auto-generate trigger
    if (posts.length > 0) {
      const newestPost = posts.reduce((newest, post) =>
        post.createdAt > newest.createdAt ? post : newest,
      );
      await ctx.db.patch(newestPost._id, { createdAt: Date.now() });
    }

    return { reset: true };
  },
});
