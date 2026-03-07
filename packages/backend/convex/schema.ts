import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  documents: defineTable({
    title: v.string(),
    fileType: v.union(v.literal("pdf"), v.literal("md")),
    storageId: v.id("_storage"),
    status: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("ready"),
      v.literal("error"),
    ),
    errorMessage: v.optional(v.string()),
    chunkCount: v.number(),
    userId: v.string(),
    createdAt: v.number(),
  }).index("by_userId", ["userId"]),

  posts: defineTable({
    content: v.string(),
    sourceChunkId: v.id("chunks"),
    sourceDocumentId: v.id("documents"),
    userId: v.string(),
    createdAt: v.number(),
  }).index("by_userId", ["userId"]),

  chunks: defineTable({
    documentId: v.id("documents"),
    content: v.string(),
    chunkIndex: v.number(),
    tokenCount: v.number(),
    embeddingStatus: v.union(v.literal("pending"), v.literal("embedded"), v.literal("error")),
    qdrantPointId: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_documentId", ["documentId"])
    .index("by_embeddingStatus", ["embeddingStatus"]),
});
