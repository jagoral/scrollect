import { v } from "convex/values";

import { internalMutation, internalQuery, mutation } from "./_generated/server";
import { requireAuth } from "./lib/functions";
import type { PostType, TypeData } from "./lib/validators";
import { normalizeTagName } from "./tags";

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

    // 0b. Delete all tags for this user
    const tags = await ctx.db
      .query("tags")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();
    for (const tag of tags) {
      await ctx.db.delete(tag._id);
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

      if (doc.storageId) {
        try {
          await ctx.storage.delete(doc.storageId);
        } catch {
          // Storage ID may be stale from a previous deployment
        }
      }
      await ctx.db.delete(doc._id);
    }

    // 3. Delete all posts and postSources for this user
    const posts = await ctx.db
      .query("posts")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();
    for (const post of posts) {
      const sources = await ctx.db
        .query("postSources")
        .withIndex("by_postId", (q) => q.eq("postId", post._id))
        .collect();
      for (const source of sources) {
        await ctx.db.delete(source._id);
      }
      if (post.assetStorageId) {
        try {
          await ctx.storage.delete(post.assetStorageId);
        } catch {
          // Storage ID may be stale from a previous deployment
        }
      }
      await ctx.db.delete(post._id);
    }

    return {
      deleted: {
        bookmarks: bookmarks.length,
        bookmarkLists: bookmarkLists.length,
        tags: tags.length,
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

    // Create first document
    const documentId = await ctx.db.insert("documents", {
      title: "E2E Seed Document",
      fileType: "md",
      storageId,
      status: "ready",
      chunkCount: 3,
      userId,
      createdAt: now,
    });

    // Create 3 chunks for first document
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

    // Create second document (for connection card) — no storageId (simulates URL-based doc)
    const documentId2 = await ctx.db.insert("documents", {
      title: "E2E Seed Document 2",
      fileType: "article",
      sourceUrl: "https://example.com/e2e-seed-2",
      status: "ready",
      chunkCount: 2,
      userId,
      createdAt: now - 1000,
    });

    const chunkIds2 = [];
    const chunkContents2 = [
      "Event-driven architecture decouples components by using events as the primary communication mechanism between services.",
      "Microservices communicate through message queues, enabling independent deployment and scaling of each service.",
    ];
    for (let i = 0; i < chunkContents2.length; i++) {
      const chunkId = await ctx.db.insert("chunks", {
        documentId: documentId2,
        content: chunkContents2[i]!,
        chunkIndex: i,
        tokenCount: 50,
        embedded: true,
        createdAt: now - 1000,
      });
      chunkIds2.push(chunkId);
    }

    // Create AI-suggested tags for both documents
    const seedTags = [
      { name: "Design Patterns", docs: [documentId, documentId2] },
      { name: "UX Design", docs: [documentId] },
      { name: "Software Architecture", docs: [documentId, documentId2] },
      { name: "Event-Driven Systems", docs: [documentId2] },
      { name: "Microservices", docs: [documentId2] },
    ];

    for (const seedTag of seedTags) {
      const normalized = normalizeTagName(seedTag.name);
      const tagId = await ctx.db.insert("tags", {
        name: seedTag.name,
        normalizedName: normalized,
        userId,
        createdAt: now,
      });
      for (const docId of seedTag.docs) {
        const doc = await ctx.db.get(docId);
        if (!doc) continue;
        const existingTagIds = doc.tagIds ?? [];
        const existingSources = doc.tagSources ?? [];
        await ctx.db.patch(docId, {
          tagIds: [...existingTagIds, tagId],
          tagSources: [...existingSources, "ai" as const],
        });
      }
    }

    // Create 7 posts covering all card types
    const postDefs: Array<{
      content: string;
      postType: PostType;
      typeData: TypeData;
      docId: typeof documentId;
      docTitle: string;
      chunkId: (typeof chunkIds)[0];
      extraSources?: Array<{ chunkId: (typeof chunkIds)[0]; documentId: typeof documentId }>;
    }> = [
      {
        content: "**Key Insight:** Lorem ipsum is a placeholder text commonly used in design.",
        postType: "insight",
        typeData: { type: "insight" },
        docId: documentId,
        docTitle: "E2E Seed Document",
        chunkId: chunkIds[0]!,
      },
      {
        content: "**Design Principle:** Good UX reduces cognitive load with digestible chunks.",
        postType: "quiz",
        typeData: {
          type: "quiz",
          variant: "multiple_choice",
          question: "What does good UX design focus on?",
          options: [
            "Reducing cognitive load",
            "Adding more features",
            "Using bright colors",
            "Complex navigation",
          ],
          correctIndex: 0,
          explanation:
            "Good UX design focuses on reducing cognitive load by breaking complex information into digestible chunks.",
        },
        docId: documentId,
        docTitle: "E2E Seed Document",
        chunkId: chunkIds[1]!,
      },
      {
        content: "The observer pattern notifies dependents when state changes.",
        postType: "quiz",
        typeData: {
          type: "quiz",
          variant: "true_false",
          question:
            "True or false: The observer pattern establishes a many-to-many dependency between objects.",
          options: ["True", "False"],
          correctIndex: 1,
          explanation:
            "The observer pattern establishes a one-to-many dependency, not many-to-many.",
        },
        docId: documentId,
        docTitle: "E2E Seed Document",
        chunkId: chunkIds[2]!,
      },
      {
        content: "**Software Pattern:** The observer pattern establishes one-to-many dependencies.",
        postType: "quote",
        typeData: {
          type: "quote",
          quotedText: "The observer pattern establishes a one-to-many dependency between objects.",
        },
        docId: documentId,
        docTitle: "E2E Seed Document",
        chunkId: chunkIds[2]!,
      },
      {
        content: "**Learning Tip:** Spaced repetition improves long-term memory retention.",
        postType: "summary",
        typeData: {
          type: "summary",
          bulletPoints: [
            "Spaced repetition improves retention",
            "Active recall strengthens memory",
          ],
        },
        docId: documentId,
        docTitle: "E2E Seed Document",
        chunkId: chunkIds[0]!,
        extraSources: [{ chunkId: chunkIds[1]!, documentId }],
      },
      {
        content:
          "Both documents discuss patterns of decoupling: the observer pattern separates subject from observers, while event-driven architecture separates producers from consumers.",
        postType: "connection",
        typeData: {
          type: "connection",
          sourceATitleHint: "E2E Seed Document",
          sourceBTitleHint: "E2E Seed Document 2",
        },
        docId: documentId,
        docTitle: "E2E Seed Document",
        chunkId: chunkIds[2]!,
        extraSources: [{ chunkId: chunkIds2[0]!, documentId: documentId2 }],
      },
      {
        content: "**Architecture:** Event-driven systems decouple producers from consumers.",
        postType: "insight",
        typeData: { type: "insight" },
        docId: documentId2,
        docTitle: "E2E Seed Document 2",
        chunkId: chunkIds2[0]!,
      },
    ];

    let postCount = 0;
    for (const def of postDefs) {
      const createdAt = now - (postDefs.length - postCount) * 1000;
      const chunkHash = `seed-hash-${postCount}`;
      const postId = await ctx.db.insert("posts", {
        content: def.content,
        postType: def.postType,
        typeData: def.typeData,
        primarySourceDocumentId: def.docId,
        primarySourceDocumentTitle: def.docTitle,
        primarySourceChunkId: def.chunkId,
        sourceChunkHash: chunkHash,
        userId,
        createdAt,
      });
      await ctx.db.insert("postSources", {
        postId,
        chunkId: def.chunkId,
        documentId: def.docId,
        userId,
        createdAt,
      });
      if (def.extraSources) {
        for (const extra of def.extraSources) {
          await ctx.db.insert("postSources", {
            postId,
            chunkId: extra.chunkId,
            documentId: extra.documentId,
            userId,
            createdAt,
          });
        }
      }
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

    // Delete all tags and clear tagIds/tagSources from documents
    const userTags = await ctx.db
      .query("tags")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();
    for (const tag of userTags) {
      await ctx.db.delete(tag._id);
    }
    const documents = await ctx.db
      .query("documents")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();
    for (const doc of documents) {
      if (doc.tagIds && doc.tagIds.length > 0) {
        await ctx.db.patch(doc._id, { tagIds: [], tagSources: [] });
      }
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
