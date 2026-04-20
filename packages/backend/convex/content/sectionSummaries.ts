import { v } from "convex/values";

import type { Id } from "../_generated/dataModel";
import { internalMutation, internalQuery } from "../_generated/server";

export const createBatch = internalMutation({
  args: {
    documentId: v.id("documents"),
    summaries: v.array(
      v.object({
        sectionTitle: v.string(),
        summary: v.string(),
        isSubstantiveContent: v.optional(v.boolean()),
        embeddingId: v.string(),
        embedding: v.optional(v.array(v.float64())),
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
        isSubstantiveContent: s.isSubstantiveContent,
        embeddingId: s.embeddingId,
        embedding: s.embedding,
        chunkStartIndex: s.chunkStartIndex,
        chunkEndIndex: s.chunkEndIndex,
        createdAt: now,
      });
      ids.push(id);
    }
    return ids;
  },
});

export const getInternal = internalQuery({
  args: { id: v.id("sectionSummaries") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
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

export const listByDocuments = internalQuery({
  args: { documentIds: v.array(v.id("documents")) },
  handler: async (ctx, args) => {
    const results = await Promise.all(
      args.documentIds.map((docId) =>
        ctx.db
          .query("sectionSummaries")
          .withIndex("by_documentId", (q) => q.eq("documentId", docId))
          .collect(),
      ),
    );
    return results.flat();
  },
});

/**
 * Single-row write primitive for refreshing `sectionSummaries.embedding`. Exists so a
 * future migration (e.g. embedding model change) can pair this with a Qdrant read and
 * patch rows in bulk without touching the summarization pipeline. No scheduler wired
 * today — this is insurance, not a feature.
 */
export const backfillEmbedding = internalMutation({
  args: {
    id: v.id("sectionSummaries"),
    embedding: v.array(v.float64()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.id);
    if (!row) return null;
    await ctx.db.patch(args.id, { embedding: args.embedding });
    return null;
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
