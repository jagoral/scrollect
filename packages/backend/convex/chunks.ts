import type { GenericCtx } from "@convex-dev/better-auth";
import { v } from "convex/values";

import type { DataModel } from "./_generated/dataModel";
import { internalMutation, query } from "./_generated/server";
import { authComponent } from "./auth";

export const listByDocument = query({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    const user = await authComponent.safeGetAuthUser(ctx as unknown as GenericCtx<DataModel>);
    if (!user) {
      return [];
    }
    const doc = await ctx.db.get(args.documentId);
    if (!doc || doc.userId !== user._id) {
      return [];
    }
    return await ctx.db
      .query("chunks")
      .withIndex("by_documentId", (q) => q.eq("documentId", args.documentId))
      .collect();
  },
});

export const createBatch = internalMutation({
  args: {
    documentId: v.id("documents"),
    chunks: v.array(
      v.object({
        content: v.string(),
        tokenCount: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const ids = await Promise.all(
      args.chunks.map((chunk, index) =>
        ctx.db.insert("chunks", {
          documentId: args.documentId,
          content: chunk.content,
          chunkIndex: index,
          tokenCount: chunk.tokenCount,
          embedded: false,
          createdAt: now,
        }),
      ),
    );
    return ids;
  },
});
