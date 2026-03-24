import { v } from "convex/values";

import { internalMutation, internalQuery } from "./_generated/server";
import { cardDraftStatus, cardDraftStrategy, postType, typeData } from "./lib/validators";

export const createBatch = internalMutation({
  args: {
    userId: v.string(),
    drafts: v.array(
      v.object({
        documentId: v.id("documents"),
        sectionSummaryId: v.optional(v.id("sectionSummaries")),
        cardType: postType,
        content: v.string(),
        typeData,
        sourceChunkIds: v.array(v.id("chunks")),
        contentHash: v.string(),
        qualityScore: v.number(),
        generationBatch: v.number(),
        strategy: cardDraftStrategy,
      }),
    ),
  },
  returns: v.array(v.id("cardDrafts")),
  handler: async (ctx, args) => {
    const now = Date.now();
    const ids = [];
    for (const draft of args.drafts) {
      const existing = await ctx.db
        .query("cardDrafts")
        .withIndex("by_userId_contentHash", (q) =>
          q.eq("userId", args.userId).eq("contentHash", draft.contentHash),
        )
        .first();
      if (existing) continue;

      const id = await ctx.db.insert("cardDrafts", {
        ...draft,
        userId: args.userId,
        status: "pending" as const,
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
    status: cardDraftStatus,
  },
  returns: v.array(
    v.object({
      _id: v.id("cardDrafts"),
      _creationTime: v.number(),
      documentId: v.id("documents"),
      sectionSummaryId: v.optional(v.id("sectionSummaries")),
      userId: v.string(),
      cardType: postType,
      content: v.string(),
      typeData,
      sourceChunkIds: v.array(v.id("chunks")),
      contentHash: v.string(),
      qualityScore: v.number(),
      status: cardDraftStatus,
      generationBatch: v.number(),
      strategy: cardDraftStrategy,
      rejectionReason: v.optional(v.string()),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("cardDrafts")
      .withIndex("by_documentId_status", (q) =>
        q.eq("documentId", args.documentId).eq("status", args.status),
      )
      .collect();
  },
});
