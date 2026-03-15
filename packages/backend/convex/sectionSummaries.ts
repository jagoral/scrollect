import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { internalMutation, internalQuery } from "./_generated/server";

export const createBatch = internalMutation({
  args: {
    documentId: v.id("documents"),
    summaries: v.array(
      v.object({
        sectionTitle: v.string(),
        summary: v.string(),
        embeddingId: v.string(),
        chunkStartIndex: v.number(),
        chunkEndIndex: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const ids: Id<"sectionSummaries">[] = [];
    for (const s of args.summaries) {
      const id = await ctx.db.insert("sectionSummaries", {
        documentId: args.documentId,
        sectionTitle: s.sectionTitle,
        summary: s.summary,
        embeddingId: s.embeddingId,
        chunkStartIndex: s.chunkStartIndex,
        chunkEndIndex: s.chunkEndIndex,
        createdAt: now,
      });
      ids.push(id);
    }
    return ids;
  },
});

export const listByDocument = internalQuery({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("sectionSummaries")
      .withIndex("by_documentId", (q) => q.eq("documentId", args.documentId))
      .collect();
  },
});

export const deleteByDocument = internalMutation({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    const summaries = await ctx.db
      .query("sectionSummaries")
      .withIndex("by_documentId", (q) => q.eq("documentId", args.documentId))
      .collect();
    for (const s of summaries) {
      await ctx.db.delete(s._id);
    }
    return summaries.length;
  },
});
