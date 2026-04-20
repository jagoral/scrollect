import { v } from "convex/values";
import type { GenericMutationCtx } from "convex/server";
import { maxBy } from "es-toolkit";

import { components } from "../_generated/api";
import type { DataModel } from "../_generated/dataModel";
import { internalMutation, internalQuery, mutation } from "../_generated/server";
import { insertEarlyAdopterGrantIfMissing } from "../access/entitlementGrants";
import { E2E_EMAIL_PATTERN } from "../../src/platform/e2e";
import { requireAuth } from "../lib/functions";
import type { PostType, TypeData } from "../lib/validators";
import { normalizeTagName } from "../content/tags";

type MutationCtx = GenericMutationCtx<DataModel>;

export const findUserByEmail = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.runQuery(components.betterAuth.adapter.findOne, {
      model: "user",
      where: [{ field: "email", value: args.email }],
    });
    return user as { _id: string; email: string; name: string } | null;
  },
});

async function cleanupUserData(ctx: MutationCtx, userId: string) {
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

  const tags = await ctx.db
    .query("tags")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .collect();
  for (const tag of tags) {
    await ctx.db.delete(tag._id);
  }

  const highlights = await ctx.db
    .query("highlights")
    .withIndex("by_userId_documentId", (q) => q.eq("userId", userId))
    .collect();
  for (const highlight of highlights) {
    await ctx.db.delete(highlight._id);
  }

  const documents = await ctx.db
    .query("documents")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .collect();

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

    const sections = await ctx.db
      .query("sectionSummaries")
      .withIndex("by_documentId", (q) => q.eq("documentId", doc._id))
      .collect();
    for (const section of sections) {
      await ctx.db.delete(section._id);
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

  const posts = await ctx.db
    .query("posts")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .collect();
  for (const post of posts) {
    if (post.assetStorageId) {
      try {
        await ctx.storage.delete(post.assetStorageId);
      } catch {
        // Storage ID may be stale from a previous deployment
      }
    }
    await ctx.db.delete(post._id);
  }

  // postDrafts must be deleted with the rest: orphaned drafts (whose document
  // was deleted in a prior cleanup) would otherwise be picked up by serveFeed
  // and materialized as posts with title "Unknown", contaminating later tests.
  const postDrafts = await ctx.db
    .query("postDrafts")
    .withIndex("by_userId_status", (q) => q.eq("userId", userId))
    .collect();
  for (const draft of postDrafts) {
    await ctx.db.delete(draft._id);
  }

  const reactionFeedbackRows = await ctx.db
    .query("reactionFeedback")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .collect();
  for (const row of reactionFeedbackRows) {
    await ctx.db.delete(row._id);
  }

  const connectionPairs = await ctx.db
    .query("connectionPairs")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .collect();
  for (const pair of connectionPairs) {
    await ctx.db.delete(pair._id);
  }

  const grants = await ctx.db
    .query("entitlementGrants")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .collect();
  for (const grant of grants) {
    await ctx.db.delete(grant._id);
  }

  const analyticsEvents = await ctx.db
    .query("e2eAnalyticsEvents")
    .withIndex("by_userId_createdAt", (q) => q.eq("userId", userId))
    .collect();
  for (const event of analyticsEvents) {
    await ctx.db.delete(event._id);
  }

  return {
    deleted: {
      bookmarks: bookmarks.length,
      bookmarkLists: bookmarkLists.length,
      highlights: highlights.length,
      tags: tags.length,
      documents: documents.length,
      posts: posts.length,
      entitlementGrants: grants.length,
    },
  };
}

async function resetUserData(ctx: MutationCtx, userId: string) {
  const posts = await ctx.db
    .query("posts")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .collect();
  for (const post of posts) {
    await ctx.db.patch(post._id, { reaction: undefined });
  }

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

  if (posts.length > 0) {
    const newestPost = maxBy(posts, (p) => p.createdAt)!;
    await ctx.db.patch(newestPost._id, { createdAt: Date.now() });
  }

  return { reset: true };
}

export const cleanupByUserId = internalMutation({
  args: { userId: v.string() },
  handler: async (ctx, args) => cleanupUserData(ctx, args.userId),
});

/**
 * E2E-only: counts the user's documents that have a `learningGoalEmbedding` populated.
 * `updateLearningGoal` schedules `embedLearningGoal` via `runAfter(0, ...)`, so tests
 * must poll this to confirm the embedding is ready before asserting goal-relevance
 * analytics.
 */
export const countDocumentsWithGoalEmbeddingByUserId = internalQuery({
  args: { userId: v.string() },
  returns: v.number(),
  handler: async (ctx, args) => {
    const docs = await ctx.db
      .query("documents")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();
    return docs.filter((d) => d.learningGoalEmbedding !== undefined).length;
  },
});

const E2E_ANALYTICS_BUFFER_LIMIT = 1000;

/**
 * E2E-only: buffer a PostHog event into `e2eAnalyticsEvents` so Playwright can assert
 * that the 4 serving-analytics events fire with the expected property shapes. Callers
 * must gate this on `isE2EEnabled()` — the mutation itself does not re-check the env,
 * so a stray caller in production would insert rows, but the route surfaces are all
 * env-gated.
 *
 * Size-bounded: if the per-user buffer exceeds `E2E_ANALYTICS_BUFFER_LIMIT`, the
 * oldest row is dropped. Keeps long test runs from ballooning the table.
 */
export const recordE2EAnalyticsEvent = internalMutation({
  args: {
    userId: v.string(),
    event: v.string(),
    properties: v.any(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert("e2eAnalyticsEvents", {
      userId: args.userId,
      event: args.event,
      properties: args.properties,
      createdAt: Date.now(),
    });

    const existing = await ctx.db
      .query("e2eAnalyticsEvents")
      .withIndex("by_userId_createdAt", (q) => q.eq("userId", args.userId))
      .collect();
    if (existing.length > E2E_ANALYTICS_BUFFER_LIMIT) {
      const overflow = existing.length - E2E_ANALYTICS_BUFFER_LIMIT;
      for (let i = 0; i < overflow; i++) {
        await ctx.db.delete(existing[i]!._id);
      }
    }
    return null;
  },
});

/**
 * Drain and return all buffered analytics events for a user, deleting them so
 * subsequent drain calls only see new events.
 */
export const drainE2EAnalyticsByUserId = internalMutation({
  args: { userId: v.string() },
  returns: v.array(
    v.object({
      event: v.string(),
      properties: v.any(),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("e2eAnalyticsEvents")
      .withIndex("by_userId_createdAt", (q) => q.eq("userId", args.userId))
      .collect();
    const result = rows.map((r) => ({
      event: r.event,
      properties: r.properties,
      createdAt: r.createdAt,
    }));
    for (const row of rows) {
      await ctx.db.delete(row._id);
    }
    return result;
  },
});

// Seeds an active Pro subscription directly into the Polar component's tables.
// Avoids the real sandbox checkout flow (which can't be exercised end-to-end on
// ephemeral Convex previews because Polar only supports a single webhook URL
// per org, so subscription.created events never reach the preview deployment).
// Mirrors what polar.registerRoutes would do on a `subscription.created` webhook.
export const seedProSubscriptionByEmail = internalMutation({
  args: { email: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (!E2E_EMAIL_PATTERN.test(args.email)) {
      throw new Error(`Seed refused: email "${args.email}" does not match E2E test pattern`);
    }
    const productId = process.env.POLAR_PRODUCT_PRO_ID;
    if (!productId) {
      throw new Error("POLAR_PRODUCT_PRO_ID is not configured");
    }
    const user = (await ctx.runQuery(components.betterAuth.adapter.findOne, {
      model: "user",
      where: [{ field: "email", value: args.email }],
    })) as { _id: string } | null;
    if (!user) {
      throw new Error(`User not found for email: ${args.email}`);
    }

    const customerId = `e2e-customer-${user._id}`;
    const subscriptionId = `e2e-subscription-${user._id}`;
    const nowIso = new Date().toISOString();
    const periodStartIso = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    const periodEndIso = new Date(Date.now() + 25 * 24 * 60 * 60 * 1000).toISOString();

    await ctx.runMutation(components.polar.lib.insertCustomer, {
      id: customerId,
      userId: user._id,
      metadata: {},
    });

    await ctx.runMutation(components.polar.lib.createProduct, {
      product: {
        id: productId,
        createdAt: nowIso,
        modifiedAt: nowIso,
        name: "Pro (E2E seed)",
        description: null,
        isRecurring: true,
        isArchived: false,
        organizationId: "e2e-organization",
        prices: [],
        medias: [],
      },
    });

    await ctx.runMutation(components.polar.lib.createSubscription, {
      subscription: {
        id: subscriptionId,
        customerId,
        createdAt: nowIso,
        modifiedAt: nowIso,
        amount: 999,
        currency: "USD",
        recurringInterval: "month",
        status: "active",
        currentPeriodStart: periodStartIso,
        currentPeriodEnd: periodEndIso,
        cancelAtPeriodEnd: false,
        startedAt: periodStartIso,
        endedAt: null,
        productId,
        checkoutId: null,
        metadata: {},
      },
    });
    return null;
  },
});

export const seedEarlyAdopterGrantByEmail = internalMutation({
  args: { email: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (!E2E_EMAIL_PATTERN.test(args.email)) {
      throw new Error(`Seed refused: email "${args.email}" does not match E2E test pattern`);
    }
    const user = (await ctx.runQuery(components.betterAuth.adapter.findOne, {
      model: "user",
      where: [{ field: "email", value: args.email }],
    })) as { _id: string } | null;
    if (!user) {
      throw new Error(`User not found for email: ${args.email}`);
    }
    await insertEarlyAdopterGrantIfMissing(ctx, {
      userId: user._id,
      source: "admin",
      note: "E2E seed",
    });
    return null;
  },
});

export const cleanupCurrentUser = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuth(ctx);

    if (!user.email || !E2E_EMAIL_PATTERN.test(user.email)) {
      throw new Error(`Cleanup refused: email "${user.email}" does not match E2E test pattern`);
    }

    return await cleanupUserData(ctx, user._id);
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

export const listConnectionDraftsByUserId = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const drafts = await ctx.db
      .query("postDrafts")
      .withIndex("by_userId_status", (q) => q.eq("userId", args.userId).eq("status", "pending"))
      .collect();

    const connectionDrafts = drafts.filter((d) => d.strategy === "connection");

    return connectionDrafts.map((d) => ({
      _id: d._id,
      documentId: d.documentId,
      postType: d.postType,
      strategy: d.strategy,
      sourceChunkIds: d.sourceChunkIds,
      typeData: d.typeData,
      content: d.content,
    }));
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

    // Create 7 posts covering all post types.
    // Insertion order is reversed from desired feed display order because
    // the feed query sorts by DESC _creationTime (last inserted = first shown).
    // The order simulates interleaving output: hook post (quiz) first in feed,
    // no two consecutive posts share the same type.
    // Feed display order: quiz(MC), insight, quiz(TF), connection, insight, quote, summary
    const postDefs: Array<{
      content: string;
      postType: PostType;
      typeData: TypeData;
      docId: typeof documentId;
      docTitle: string;
      fileType: string;
      chunkId: (typeof chunkIds)[0];
      strategy: "section" | "thematic" | "highlight" | "connection";
    }> = [
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
        docId: documentId2,
        docTitle: "E2E Seed Document 2",
        fileType: "article",
        chunkId: chunkIds2[1]!,
        strategy: "section",
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
        fileType: "md",
        chunkId: chunkIds[2]!,
        strategy: "section",
      },
      {
        content: "**Architecture:** Event-driven systems decouple producers from consumers.",
        postType: "insight",
        typeData: { type: "insight" },
        docId: documentId2,
        docTitle: "E2E Seed Document 2",
        fileType: "article",
        chunkId: chunkIds2[0]!,
        strategy: "section",
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
        fileType: "md",
        chunkId: chunkIds[2]!,
        strategy: "connection",
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
        fileType: "md",
        chunkId: chunkIds[2]!,
        strategy: "section",
      },
      {
        content: "**Key Insight:** Lorem ipsum is a placeholder text commonly used in design.",
        postType: "insight",
        typeData: { type: "insight" },
        docId: documentId,
        docTitle: "E2E Seed Document",
        fileType: "md",
        chunkId: chunkIds[0]!,
        strategy: "section",
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
        docId: documentId2,
        docTitle: "E2E Seed Document 2",
        fileType: "article",
        chunkId: chunkIds2[0]!,
        strategy: "section",
      },
    ];

    let postCount = 0;
    for (const def of postDefs) {
      const createdAt = now - (postDefs.length - postCount) * 1000;
      const contentHash = `seed-hash-${postCount}`;

      const postDraftId = await ctx.db.insert("postDrafts", {
        documentId: def.docId,
        userId,
        postType: def.postType,
        content: def.content,
        typeData: def.typeData,
        sourceChunkIds: [def.chunkId],
        contentHash,
        qualityScore: 0.8,
        status: "served" as const,
        servedCount: 1,
        generationBatch: 1,
        strategy: def.strategy,
        createdAt,
      });

      await ctx.db.insert("posts", {
        content: def.content,
        postType: def.postType,
        typeData: def.typeData,
        primarySourceDocumentId: def.docId,
        primarySourceDocumentTitle: def.docTitle,
        postDraftId,
        fileType: def.fileType,
        userId,
        createdAt,
      });

      postCount++;
    }

    return { documentId, chunkCount: chunkIds.length, postCount };
  },
});

export const resetByUserId = internalMutation({
  args: { userId: v.string() },
  handler: async (ctx, args) => resetUserData(ctx, args.userId),
});

export const resetE2EAccount = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuth(ctx);

    if (!user.email || !E2E_EMAIL_PATTERN.test(user.email)) {
      throw new Error(`Reset refused: email "${user.email}" does not match E2E test pattern`);
    }

    return await resetUserData(ctx, user._id);
  },
});
