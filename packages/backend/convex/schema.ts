import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  documents: defineTable({
    title: v.string(),
    fileType: v.union(v.literal("pdf"), v.literal("md")),
    storageId: v.id("_storage"),
    status: v.union(
      v.literal("uploaded"),
      v.literal("parsing"),
      v.literal("chunking"),
      v.literal("embedding"),
      v.literal("ready"),
      v.literal("error"),
    ),
    failedAt: v.optional(
      v.union(v.literal("parsing"), v.literal("chunking"), v.literal("embedding")),
    ),
    datalabCheckUrl: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    chunkCount: v.number(),
    userId: v.string(),
    createdAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_status", ["status"]),

  posts: defineTable({
    content: v.string(),
    sourceChunkId: v.id("chunks"),
    sourceDocumentId: v.id("documents"),
    userId: v.string(),
    assetStorageId: v.optional(v.id("_storage")),
    saved: v.optional(v.boolean()),
    reaction: v.optional(v.union(v.literal("like"), v.literal("dislike"))),
    createdAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_saved", ["userId", "saved"]),

  chunks: defineTable({
    documentId: v.id("documents"),
    content: v.string(),
    chunkIndex: v.number(),
    tokenCount: v.number(),
    embedded: v.boolean(),
    embeddingId: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_documentId", ["documentId"])
    .index("by_documentId_unembedded", ["documentId", "embedded"]),

  processingJobs: defineTable({
    documentId: v.id("documents"),
    totalBatches: v.number(),
    completedBatches: v.number(),
    failedBatches: v.number(),
    retryCount: v.number(),
    createdAt: v.number(),
  }).index("by_documentId", ["documentId"]),
});
