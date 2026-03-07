import { v } from "convex/values";

import { internalMutation } from "./_generated/server";

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
          embeddingStatus: "pending",
          createdAt: now,
        }),
      ),
    );
    return ids;
  },
});
