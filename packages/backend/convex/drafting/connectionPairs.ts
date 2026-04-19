import { v } from "convex/values";

import { internalMutation, internalQuery } from "../_generated/server";
import { connectionPairStatus, connectionType } from "../lib/validators";

export const createBatch = internalMutation({
  args: {
    pairs: v.array(
      v.object({
        userId: v.string(),
        sectionSummaryIdA: v.id("sectionSummaries"),
        sectionSummaryIdB: v.id("sectionSummaries"),
        documentIdA: v.id("documents"),
        documentIdB: v.id("documents"),
        similarityScore: v.number(),
        connectionType,
        status: connectionPairStatus,
      }),
    ),
  },
  returns: v.array(v.id("connectionPairs")),
  handler: async (ctx, args) => {
    const now = Date.now();
    const ids = await Promise.all(
      args.pairs.map((pair) => ctx.db.insert("connectionPairs", { ...pair, createdAt: now })),
    );
    return ids;
  },
});

export const listPairKeysByUserId = internalQuery({
  args: { userId: v.string() },
  returns: v.array(
    v.object({
      sectionSummaryIdA: v.id("sectionSummaries"),
      sectionSummaryIdB: v.id("sectionSummaries"),
    }),
  ),
  handler: async (ctx, args) => {
    const pairs = await ctx.db
      .query("connectionPairs")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();
    return pairs.map((p) => ({
      sectionSummaryIdA: p.sectionSummaryIdA,
      sectionSummaryIdB: p.sectionSummaryIdB,
    }));
  },
});

export const cascadeDeleteByDocumentId = internalMutation({
  args: { documentId: v.id("documents") },
  returns: v.object({ deletedConnectionPairs: v.number() }),
  handler: async (ctx, args) => {
    const pairsA = await ctx.db
      .query("connectionPairs")
      .withIndex("by_documentIdA", (q) => q.eq("documentIdA", args.documentId))
      .collect();

    const pairsB = await ctx.db
      .query("connectionPairs")
      .withIndex("by_documentIdB", (q) => q.eq("documentIdB", args.documentId))
      .collect();

    const allIds = new Set([...pairsA.map((p) => p._id), ...pairsB.map((p) => p._id)]);
    for (const id of allIds) {
      await ctx.db.delete(id);
    }

    return { deletedConnectionPairs: allIds.size };
  },
});
