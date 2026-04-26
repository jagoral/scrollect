import { v } from "convex/values";

import { internalMutation, internalQuery } from "../_generated/server";
import { postDraftStatus, postDraftStrategy, postType, typeData } from "../lib/validators";

export const createBatch = internalMutation({
  args: {
    userId: v.string(),
    drafts: v.array(
      v.object({
        documentId: v.id("documents"),
        sectionSummaryId: v.optional(v.id("sectionSummaries")),
        postType: postType,
        content: v.string(),
        typeData,
        sourceChunkIds: v.array(v.id("chunks")),
        contentHash: v.string(),
        qualityScore: v.number(),
        semanticQualityScore: v.optional(v.number()),
        sectionQualitySignal: v.optional(v.number()),
        generationBatch: v.number(),
        strategy: postDraftStrategy,
      }),
    ),
  },
  returns: v.array(v.id("postDrafts")),
  handler: async (ctx, args) => {
    const now = Date.now();
    const ids = [];
    for (const draft of args.drafts) {
      const existing = await ctx.db
        .query("postDrafts")
        .withIndex("by_userId_contentHash", (q) =>
          q.eq("userId", args.userId).eq("contentHash", draft.contentHash),
        )
        .first();
      if (existing) continue;

      const id = await ctx.db.insert("postDrafts", {
        ...draft,
        userId: args.userId,
        status: "pending" as const,
        servedCount: 0,
        createdAt: now,
      });
      ids.push(id);
    }
    return ids;
  },
});

export const listByDocumentStatus = internalQuery({
  args: {
    documentId: v.id("documents"),
    status: postDraftStatus,
  },
  returns: v.array(
    v.object({
      _id: v.id("postDrafts"),
      _creationTime: v.number(),
      documentId: v.id("documents"),
      sectionSummaryId: v.optional(v.id("sectionSummaries")),
      userId: v.string(),
      postType: postType,
      content: v.string(),
      typeData,
      sourceChunkIds: v.array(v.id("chunks")),
      contentHash: v.string(),
      qualityScore: v.number(),
      semanticQualityScore: v.optional(v.number()),
      sectionQualitySignal: v.optional(v.number()),
      status: postDraftStatus,
      servedCount: v.optional(v.number()),
      generationBatch: v.number(),
      strategy: postDraftStrategy,
      rejectionReason: v.optional(v.string()),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("postDrafts")
      .withIndex("by_documentId_status", (q) =>
        q.eq("documentId", args.documentId).eq("status", args.status),
      )
      .collect();
  },
});

/**
 * Cap the count at this value - the only consumer is the push-notification threshold
 * check, which doesn't need an exact tally above the threshold and would otherwise pay
 * for a full collect on heavy users. Must remain strictly greater than
 * `DRAFT_POOL_THRESHOLD`, otherwise sends would never fire (the pure-logic test in
 * `tests/notifications/draftPoolPush.test.ts` guards this invariant).
 */
const PENDING_COUNT_CAP = 100;

export const countPendingForUser = internalQuery({
  args: { userId: v.string() },
  returns: v.number(),
  handler: async (ctx, { userId }) => {
    const rows = await ctx.db
      .query("postDrafts")
      .withIndex("by_userId_status", (q) => q.eq("userId", userId).eq("status", "pending"))
      .take(PENDING_COUNT_CAP);
    return rows.length;
  },
});

export const listByDocument = internalQuery({
  args: { documentId: v.id("documents") },
  returns: v.array(
    v.object({
      _id: v.id("postDrafts"),
      _creationTime: v.number(),
      documentId: v.id("documents"),
      sectionSummaryId: v.optional(v.id("sectionSummaries")),
      userId: v.string(),
      postType: postType,
      content: v.string(),
      typeData,
      sourceChunkIds: v.array(v.id("chunks")),
      contentHash: v.string(),
      qualityScore: v.number(),
      semanticQualityScore: v.optional(v.number()),
      sectionQualitySignal: v.optional(v.number()),
      status: postDraftStatus,
      servedCount: v.optional(v.number()),
      generationBatch: v.number(),
      strategy: postDraftStrategy,
      rejectionReason: v.optional(v.string()),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("postDrafts")
      .withIndex("by_documentId", (q) => q.eq("documentId", args.documentId))
      .collect();
  },
});
