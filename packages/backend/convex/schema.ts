import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

import {
  documentStatus,
  failedAtStage,
  fileType,
  postType,
  reactionType,
  typeData,
} from "./lib/validators";

export default defineSchema({
  documents: defineTable({
    title: v.string(),
    fileType,
    storageId: v.optional(v.id("_storage")),
    sourceUrl: v.optional(v.string()),
    status: documentStatus,
    failedAt: v.optional(failedAtStage),
    datalabCheckUrl: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    chunkCount: v.number(),
    userId: v.string(),
    createdAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_status", ["status"])
    .index("by_userId_status", ["userId", "status"]),

  posts: defineTable({
    content: v.string(),
    postType,
    typeData,
    primarySourceDocumentId: v.id("documents"),
    primarySourceDocumentTitle: v.string(),
    primarySourceChunkId: v.id("chunks"),
    primarySourceSectionTitle: v.optional(v.string()),
    primarySourcePageNumber: v.optional(v.number()),
    sourceChunkHash: v.string(),
    userId: v.string(),
    assetStorageId: v.optional(v.id("_storage")),
    reaction: v.optional(reactionType),
    createdAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_type", ["userId", "postType"])
    .index("by_userId_createdAt", ["userId", "createdAt"])
    .index("by_userId_sourceChunkHash", ["userId", "sourceChunkHash"]),

  postSources: defineTable({
    postId: v.id("posts"),
    chunkId: v.id("chunks"),
    documentId: v.id("documents"),
    userId: v.string(),
    createdAt: v.number(),
  })
    .index("by_postId", ["postId"])
    .index("by_chunkId", ["chunkId"])
    .index("by_documentId", ["documentId"])
    .index("by_userId", ["userId"])
    .index("by_userId_createdAt", ["userId", "createdAt"]),

  bookmarkLists: defineTable({
    userId: v.string(),
    name: v.string(),
    isDefault: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_default", ["userId", "isDefault"]),

  bookmarks: defineTable({
    userId: v.string(),
    postId: v.id("posts"),
    listId: v.id("bookmarkLists"),
    createdAt: v.number(),
  })
    .index("by_post_and_list", ["postId", "listId"])
    .index("by_list", ["listId"])
    .index("by_userId_post", ["userId", "postId"]),

  chunks: defineTable({
    documentId: v.id("documents"),
    content: v.string(),
    chunkIndex: v.number(),
    tokenCount: v.number(),
    embedded: v.boolean(),
    embeddingId: v.optional(v.string()),
    pageNumber: v.optional(v.number()),
    sectionTitle: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_documentId", ["documentId"])
    .index("by_documentId_chunkIndex", ["documentId", "chunkIndex"])
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
