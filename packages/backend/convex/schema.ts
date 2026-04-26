import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

import {
  postDraftStatus,
  postDraftStrategy,
  connectionPairStatus,
  connectionType,
  dislikeReason,
  documentStatus,
  entitlementGrantType,
  entitlementTier,
  failedAtStage,
  fileType,
  highlightSource,
  learningGoalOnboardingStatus,
  postType,
  reactionType,
  tagSource,
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
    runpodJobId: v.optional(v.string()),
    runpodSubmittedAt: v.optional(v.number()),
    errorMessage: v.optional(v.string()),
    chunkCount: v.number(),
    language: v.optional(v.string()),
    summary: v.optional(v.string()),
    summaryEmbeddingId: v.optional(v.string()),
    tagIds: v.optional(v.array(v.id("tags"))),
    tagSources: v.optional(v.array(tagSource)),
    learningGoal: v.optional(v.string()),
    learningGoalOnboardingStatus: v.optional(learningGoalOnboardingStatus),
    // Embedding of `learningGoal`. Colocated with the text so the serving scorer can
    // match the goal a user actually wrote against that document, even when they edit
    // or clear the goal on another document. Future per-topic scoping (ADR-018 §3)
    // will resolve through the same read seam without schema changes.
    learningGoalEmbedding: v.optional(v.array(v.float64())),
    thumbnailUrl: v.optional(v.string()),
    userId: v.string(),
    createdAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_createdAt", ["userId", "createdAt"])
    .index("by_status", ["status"])
    .index("by_userId_status", ["userId", "status"])
    .index("by_runpodJobId", ["runpodJobId"]),

  userProfiles: defineTable({
    userId: v.string(),
    onboardingCompleted: v.boolean(),
    createdAt: v.number(),
  }).index("by_userId", ["userId"]),

  // E2E-only: buffered PostHog events so Playwright tests can assert the 4 serving
  // analytics events fire with the expected property shapes. Writes gated on
  // `ENABLE_E2E_ROUTES` at the call site; rows are drained + deleted via
  // `/api/e2e-analytics-drain` and cascade-cleaned with other test data.
  e2eAnalyticsEvents: defineTable({
    userId: v.string(),
    event: v.string(),
    properties: v.any(),
    createdAt: v.number(),
  }).index("by_userId_createdAt", ["userId", "createdAt"]),

  posts: defineTable({
    content: v.string(),
    postType,
    typeData,
    primarySourceDocumentId: v.id("documents"),
    primarySourceDocumentTitle: v.string(),
    // v2 fields (optional for backward compat with existing dev data)
    postDraftId: v.optional(v.id("postDrafts")),
    sectionTitle: v.optional(v.string()),
    pageStart: v.optional(v.number()),
    pageEnd: v.optional(v.number()),
    fileType: v.optional(v.string()),
    /**
     * Denormalized active-topic id at post insertion time (B1 / ADR-019). Lets the
     * topic-scoped feed pagination use the `by_userId_topic` index instead of paging
     * the user's full feed and filtering in memory (which leaks "ghost pages" to the
     * client). Mutations that move/remove a topic assignment restamp this column on
     * affected posts; deletes set it back to undefined.
     */
    topicId: v.optional(v.id("topics")),
    // TODO(post-launch): Drop legacy fields after wiping dev data
    primarySourceChunkId: v.optional(v.id("chunks")),
    primarySourceSectionTitle: v.optional(v.string()),
    primarySourcePageNumber: v.optional(v.number()),
    sourceChunkHash: v.optional(v.string()),
    userId: v.string(),
    assetStorageId: v.optional(v.id("_storage")),
    reaction: v.optional(reactionType),
    createdAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_type", ["userId", "postType"])
    .index("by_userId_createdAt", ["userId", "createdAt"])
    .index("by_userId_document", ["userId", "primarySourceDocumentId"])
    .index("by_userId_topic", ["userId", "topicId"]),

  reactionFeedback: defineTable({
    userId: v.string(),
    postId: v.id("posts"),
    postDraftId: v.id("postDrafts"),
    reaction: reactionType,
    dislikeReason: v.optional(dislikeReason),
    createdAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_postDraftId", ["userId", "postDraftId"]),

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

  sectionSummaries: defineTable({
    documentId: v.id("documents"),
    sectionTitle: v.string(),
    summary: v.string(),
    isSubstantiveContent: v.optional(v.boolean()),
    embeddingId: v.string(),
    // Dense embedding of the section summary, persisted in addition to the Qdrant vector
    // so the `serveFeed` mutation can compute learning-goal cosine similarity without an
    // external HTTP call (Convex mutations cannot reach Qdrant). The Qdrant copy remains
    // the source of truth for cross-document search; this column is a read-side denormalization.
    embedding: v.optional(v.array(v.float64())),
    chunkStartIndex: v.number(),
    chunkEndIndex: v.number(),
    createdAt: v.number(),
  }).index("by_documentId", ["documentId"]),

  highlights: defineTable({
    documentId: v.id("documents"),
    text: v.string(),
    note: v.optional(v.string()),
    pageNumber: v.optional(v.number()),
    externalId: v.string(),
    source: highlightSource,
    sourceMetadata: v.optional(v.record(v.string(), v.string())),
    draftGenerated: v.optional(v.boolean()),
    userId: v.string(),
    createdAt: v.number(),
  })
    .index("by_userId_documentId", ["userId", "documentId"])
    .index("by_userId_externalId", ["userId", "externalId"])
    .index("by_documentId_draftGenerated", ["documentId", "draftGenerated"]),

  tags: defineTable({
    name: v.string(),
    normalizedName: v.string(),
    userId: v.string(),
    createdAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_normalizedName", ["userId", "normalizedName"]),

  postDrafts: defineTable({
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
  })
    .index("by_documentId", ["documentId"])
    .index("by_userId_status", ["userId", "status"])
    .index("by_documentId_status", ["documentId", "status"])
    .index("by_userId_contentHash", ["userId", "contentHash"])
    .index("by_userId_status_postType", ["userId", "status", "postType"]),

  entitlementGrants: defineTable({
    userId: v.string(),
    grantType: entitlementGrantType,
    tier: entitlementTier,
    grantedAt: v.number(),
    note: v.optional(v.string()),
  }).index("by_userId", ["userId"]),

  connectionPairs: defineTable({
    userId: v.string(),
    sectionSummaryIdA: v.id("sectionSummaries"),
    sectionSummaryIdB: v.id("sectionSummaries"),
    documentIdA: v.id("documents"),
    documentIdB: v.id("documents"),
    similarityScore: v.number(),
    connectionType,
    status: connectionPairStatus,
    createdAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_documentIdA", ["documentIdA"])
    .index("by_documentIdB", ["documentIdB"])
    .index("by_userId_status", ["userId", "status"]),

  // Personal goal-scoped lens over a subset of documents (ADR-019). When the feed is
  // scoped to a topic, posts are ranked against the topic's `learningGoalEmbedding`
  // instead of the per-document goal — see `getEffectiveLearningGoalEmbedding`. The
  // embedding is colocated with the goal text so edits don't trample sibling topics.
  topics: defineTable({
    userId: v.string(),
    name: v.string(),
    learningGoal: v.string(),
    learningGoalEmbedding: v.optional(v.array(v.float64())),
    description: v.optional(v.string()),
    color: v.optional(v.string()),
    icon: v.optional(v.string()),
    parentTopicId: v.optional(v.id("topics")),
    /**
     * Denormalized count of `documentTopics` rows pointing at this topic (B3).
     * `listTopics` reads this directly instead of running per-topic assignment
     * counts. Maintained by `setDocumentTopic` / `removeDocumentFromTopic` /
     * `cascadeDeleteByDocumentId`. Treats `undefined` as 0 for back-compat with
     * pre-backfill rows; the `backfillTopicDocumentCount` migration recomputes it.
     */
    documentCount: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_name", ["userId", "name"]),

  // Junction between documents and topics. v1 UI is single-topic-per-document, but the
  // schema permits multiple rows per document so future multi-select doesn't require a
  // migration. The resolver picks the most-recent assignment when several exist.
  documentTopics: defineTable({
    documentId: v.id("documents"),
    topicId: v.id("topics"),
    userId: v.string(),
    createdAt: v.number(),
  })
    .index("by_documentId", ["documentId"])
    .index("by_topicId", ["topicId"])
    .index("by_userId", ["userId"]),
});
