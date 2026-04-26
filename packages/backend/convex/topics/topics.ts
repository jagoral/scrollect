import { ConvexError, v } from "convex/values";

import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { mutation, query, internalMutation } from "../_generated/server";
import { requireAuth, optionalAuth } from "../lib/functions";
import { WideEvent } from "../../src/platform/logging";
import { pickActiveTopicForDocument } from "../../src/feed/logic/pickActiveTopicForDocument";
import {
  TopicValidationError,
  assertOwnedTopic,
  sanitizeAppearance,
  sanitizeDescription,
  validateLearningGoal,
  validateName,
} from "../../src/topics/validation";

export const listTopics = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("topics"),
      _creationTime: v.number(),
      userId: v.string(),
      name: v.string(),
      learningGoal: v.string(),
      learningGoalEmbedding: v.optional(v.array(v.float64())),
      description: v.optional(v.string()),
      color: v.optional(v.string()),
      icon: v.optional(v.string()),
      parentTopicId: v.optional(v.id("topics")),
      createdAt: v.number(),
      documentCount: v.number(),
    }),
  ),
  handler: async (ctx, _args) => {
    const user = await optionalAuth(ctx);
    if (!user) return [];

    const topics = await ctx.db
      .query("topics")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();

    // Reads the denormalized counter (B3) — back-compat fallback for rows pre-backfill.
    return topics.map((topic) => ({
      ...topic,
      documentCount: topic.documentCount ?? 0,
    }));
  },
});

export const getTopic = query({
  args: { topicId: v.id("topics") },
  returns: v.union(
    v.object({
      topic: v.object({
        _id: v.id("topics"),
        _creationTime: v.number(),
        userId: v.string(),
        name: v.string(),
        learningGoal: v.string(),
        learningGoalEmbedding: v.optional(v.array(v.float64())),
        description: v.optional(v.string()),
        color: v.optional(v.string()),
        icon: v.optional(v.string()),
        parentTopicId: v.optional(v.id("topics")),
        createdAt: v.number(),
        documentCount: v.number(),
      }),
      documents: v.array(
        v.object({
          _id: v.id("documents"),
          title: v.string(),
          status: v.string(),
          fileType: v.string(),
          createdAt: v.number(),
        }),
      ),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const user = await optionalAuth(ctx);
    if (!user) return null;

    const topic = await ctx.db.get(args.topicId);
    if (!topic || topic.userId !== user._id) return null;

    const assignments = await ctx.db
      .query("documentTopics")
      .withIndex("by_topicId", (q) => q.eq("topicId", args.topicId))
      .collect();

    const documents = await Promise.all(assignments.map((a) => ctx.db.get(a.documentId)));
    const ownedDocs = documents.filter(
      (doc): doc is Doc<"documents"> => doc !== null && doc.userId === user._id,
    );

    return {
      topic: { ...topic, documentCount: topic.documentCount ?? 0 },
      documents: ownedDocs.map((doc) => ({
        _id: doc._id,
        title: doc.title,
        status: doc.status,
        fileType: doc.fileType,
        createdAt: doc.createdAt,
      })),
    };
  },
});

export const getDocumentTopic = query({
  args: { documentId: v.id("documents") },
  returns: v.union(
    v.object({
      _id: v.id("topics"),
      _creationTime: v.number(),
      userId: v.string(),
      name: v.string(),
      learningGoal: v.string(),
      learningGoalEmbedding: v.optional(v.array(v.float64())),
      description: v.optional(v.string()),
      color: v.optional(v.string()),
      icon: v.optional(v.string()),
      parentTopicId: v.optional(v.id("topics")),
      createdAt: v.number(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const user = await optionalAuth(ctx);
    if (!user) return null;

    const document = await ctx.db.get(args.documentId);
    if (!document || document.userId !== user._id) return null;

    const assignments = await ctx.db
      .query("documentTopics")
      .withIndex("by_documentId", (q) => q.eq("documentId", args.documentId))
      .collect();
    const activeTopicId = pickActiveTopicForDocument(
      assignments.map((a) => ({ topicId: a.topicId as string, createdAt: a.createdAt })),
    );
    if (activeTopicId === undefined) return null;

    const topic = await ctx.db.get(activeTopicId as Id<"topics">);
    if (!topic || topic.userId !== user._id) return null;
    // Strip back-compat fields not part of this query's return validator.
    const { documentCount: _omit, ...rest } = topic as Doc<"topics"> & {
      documentCount?: number;
    };
    return rest;
  },
});

export const getDocumentTopicsBatch = query({
  args: { documentIds: v.array(v.id("documents")) },
  handler: async (ctx, args) => {
    const user = await optionalAuth(ctx);
    if (!user) return {};

    const result: Record<string, Doc<"topics"> | null> = {};

    const docs = await Promise.all(args.documentIds.map((id) => ctx.db.get(id)));
    const ownedDocIds: Id<"documents">[] = [];
    for (const doc of docs) {
      if (!doc || doc.userId !== user._id) continue;
      ownedDocIds.push(doc._id);
      result[doc._id] = null;
    }

    const assignmentsByDoc = await Promise.all(
      ownedDocIds.map((documentId) =>
        ctx.db
          .query("documentTopics")
          .withIndex("by_documentId", (q) => q.eq("documentId", documentId))
          .collect(),
      ),
    );

    const uniqueTopicIds = new Set<Id<"topics">>();
    for (const assignments of assignmentsByDoc) {
      for (const assignment of assignments) {
        uniqueTopicIds.add(assignment.topicId);
      }
    }

    const topicMap = new Map<Id<"topics">, Doc<"topics">>();
    const topicRecords = await Promise.all([...uniqueTopicIds].map((id) => ctx.db.get(id)));
    for (const topic of topicRecords) {
      if (topic && topic.userId === user._id) topicMap.set(topic._id, topic);
    }

    for (let i = 0; i < ownedDocIds.length; i += 1) {
      const documentId = ownedDocIds[i]!;
      const assignments = assignmentsByDoc[i] ?? [];
      const activeTopicId = pickActiveTopicForDocument(
        assignments.map((a) => ({ topicId: a.topicId as string, createdAt: a.createdAt })),
      );
      if (activeTopicId === undefined) continue;
      const topic = topicMap.get(activeTopicId as Id<"topics">);
      if (topic) result[documentId] = topic;
    }

    return result;
  },
});

export const createTopic = mutation({
  args: {
    name: v.string(),
    learningGoal: v.string(),
    description: v.optional(v.string()),
    color: v.optional(v.string()),
    icon: v.optional(v.string()),
    parentTopicId: v.optional(v.id("topics")),
  },
  returns: v.id("topics"),
  handler: async (ctx, args) => {
    const evt = new WideEvent("topics.createTopic");
    try {
      const user = await requireAuth(ctx);
      evt.set("userId", user._id);

      const limit = await ctx.runMutation(internal.lib.rateLimitChecks.enforceTopicCreateLimit, {
        userId: user._id,
        userCreatedAt: user.createdAt,
      });
      if (!limit.ok) {
        evt.set({ rateLimited: true, retryAfterMs: limit.retryAfter });
        throw new ConvexError({
          kind: "RateLimited" as const,
          name: "topicCreate",
          retryAfter: limit.retryAfter,
        });
      }

      const name = applyValidation(() => validateName(args.name));
      const learningGoal = applyValidation(() => validateLearningGoal(args.learningGoal));
      const description = applyValidation(() => sanitizeDescription(args.description));
      const color = applyValidation(() => sanitizeAppearance(args.color, "color"));
      const icon = applyValidation(() => sanitizeAppearance(args.icon, "icon"));

      await requireUniqueTopicName(ctx, { userId: user._id, name });

      if (args.parentTopicId !== undefined) {
        const parent = await ctx.db.get(args.parentTopicId);
        if (!parent || parent.userId !== user._id) {
          throw new ConvexError({ code: "topic_not_found" as const });
        }
      }

      const topicId = await ctx.db.insert("topics", {
        userId: user._id,
        name,
        learningGoal,
        description,
        color,
        icon,
        parentTopicId: args.parentTopicId,
        documentCount: 0,
        createdAt: Date.now(),
      });
      evt.set({ topicId });

      await ctx.scheduler.runAfter(0, internal.topics.topicsActions.embedTopicGoal, {
        topicId,
        learningGoal,
        userId: user._id,
        userCreatedAt: user.createdAt,
      });

      await ctx.scheduler.runAfter(0, internal.topics.topicsActions.captureTopicAnalytics, {
        userId: user._id,
        payload: {
          event: "topic_created",
          properties: {
            topic_id: topicId,
            has_description: description !== undefined && description.length > 0,
            has_color: color !== undefined && color.length > 0,
            has_icon: icon !== undefined && icon.length > 0,
          },
        },
      });

      return topicId;
    } catch (error) {
      evt.setError(error);
      throw error;
    } finally {
      evt.emit();
    }
  },
});

export const updateTopic = mutation({
  args: {
    topicId: v.id("topics"),
    name: v.optional(v.string()),
    learningGoal: v.optional(v.string()),
    description: v.optional(v.string()),
    color: v.optional(v.string()),
    icon: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const evt = new WideEvent("topics.updateTopic");
    evt.set("topicId", args.topicId);
    try {
      const user = await requireAuth(ctx);
      evt.set("userId", user._id);

      const topic = await requireOwnedTopic(ctx, { topicId: args.topicId, userId: user._id });

      const update: Partial<Doc<"topics">> = {};
      if (args.name !== undefined) {
        const nextName = applyValidation(() => validateName(args.name as string));
        if (nextName !== topic.name) {
          await requireUniqueTopicName(ctx, {
            userId: user._id,
            name: nextName,
            excludeTopicId: args.topicId,
          });
        }
        update.name = nextName;
      }
      if (args.description !== undefined) {
        update.description = applyValidation(() => sanitizeDescription(args.description)) ?? "";
      }
      if (args.color !== undefined) {
        update.color = applyValidation(() => sanitizeAppearance(args.color, "color")) ?? "";
      }
      if (args.icon !== undefined) {
        update.icon = applyValidation(() => sanitizeAppearance(args.icon, "icon")) ?? "";
      }

      let goalChanged = false;
      let nextGoal: string | undefined;
      if (args.learningGoal !== undefined) {
        nextGoal = applyValidation(() => validateLearningGoal(args.learningGoal as string));
        if (nextGoal !== topic.learningGoal) {
          goalChanged = true;
          update.learningGoal = nextGoal;
          update.learningGoalEmbedding = undefined;
        }
      }

      if (Object.keys(update).length > 0) {
        await ctx.db.patch(args.topicId, update);
      }

      if (goalChanged && nextGoal !== undefined) {
        await ctx.scheduler.runAfter(0, internal.topics.topicsActions.embedTopicGoal, {
          topicId: args.topicId,
          learningGoal: nextGoal,
          userId: user._id,
          userCreatedAt: user.createdAt,
        });

        await ctx.scheduler.runAfter(0, internal.topics.topicsActions.captureTopicAnalytics, {
          userId: user._id,
          payload: {
            event: "topic_goal_edited",
            properties: { topic_id: args.topicId },
          },
        });
      }

      return null;
    } catch (error) {
      evt.setError(error);
      throw error;
    } finally {
      evt.emit();
    }
  },
});

export const deleteTopic = mutation({
  args: { topicId: v.id("topics") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const evt = new WideEvent("topics.deleteTopic");
    evt.set("topicId", args.topicId);
    try {
      const user = await requireAuth(ctx);
      evt.set("userId", user._id);

      await requireOwnedTopic(ctx, { topicId: args.topicId, userId: user._id });

      const assignments = await ctx.db
        .query("documentTopics")
        .withIndex("by_topicId", (q) => q.eq("topicId", args.topicId))
        .collect();

      // Clear topicId on posts that pointed at the deleted topic so topic-scoped
      // pagination (B1) returns empty for the dead topic and posts re-appear in the
      // unscoped feed. Use the by_userId_topic index to avoid scanning all posts.
      const orphanedPosts = await ctx.db
        .query("posts")
        .withIndex("by_userId_topic", (q) => q.eq("userId", user._id).eq("topicId", args.topicId))
        .collect();

      await Promise.all([
        ...assignments.map((a) => ctx.db.delete(a._id)),
        ...orphanedPosts.map((p) => ctx.db.patch(p._id, { topicId: undefined })),
        ctx.db.delete(args.topicId),
      ]);
      evt.set({ documentCount: assignments.length, postsCleared: orphanedPosts.length });

      await ctx.scheduler.runAfter(0, internal.topics.topicsActions.captureTopicAnalytics, {
        userId: user._id,
        payload: {
          event: "topic_deleted",
          properties: { topic_id: args.topicId, document_count: assignments.length },
        },
      });

      return null;
    } catch (error) {
      evt.setError(error);
      throw error;
    } finally {
      evt.emit();
    }
  },
});

/**
 * Sets the active topic on a document, replacing any existing assignment(s).
 * Renamed from `assignDocumentToTopic` (B8) to better describe the upsert behaviour;
 * the PostHog event name `document_assigned_to_topic` is preserved so historical
 * analytics queries continue to work.
 *
 * Side effects, all in one transaction:
 *  - Insert the new `documentTopics` row.
 *  - Delete any existing assignments for this document (single-select v1 UI).
 *  - Increment `topics.documentCount` on the new topic; decrement on each
 *    replaced topic. Counter denormalization (B3) lets `listTopics` skip the
 *    per-topic assignment scan.
 *  - Stamp `posts.topicId` on every post drawn from this document so topic-scoped
 *    pagination (B1) can use the `by_userId_topic` index.
 */
export const setDocumentTopic = mutation({
  args: {
    documentId: v.id("documents"),
    topicId: v.id("topics"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const evt = new WideEvent("topics.setDocumentTopic");
    evt.set({ documentId: args.documentId, topicId: args.topicId });
    try {
      const user = await requireAuth(ctx);
      evt.set("userId", user._id);

      const document = await ctx.db.get(args.documentId);
      if (!document || document.userId !== user._id) {
        throw new ConvexError({ code: "document_not_found" as const });
      }
      await requireOwnedTopic(ctx, { topicId: args.topicId, userId: user._id });

      const existing = await ctx.db
        .query("documentTopics")
        .withIndex("by_documentId", (q) => q.eq("documentId", args.documentId))
        .collect();

      const sameTopic = existing.find((a) => a.topicId === args.topicId);
      if (sameTopic) {
        evt.set("noop", true);
        return null;
      }

      const replacedTopicIds = existing.map((a) => a.topicId as Id<"topics">);

      // Posts to restamp with the new topicId. Use by_userId_document so we touch only
      // posts for this specific document — topic moves elsewhere don't ripple here.
      const postsForDocument = await ctx.db
        .query("posts")
        .withIndex("by_userId_document", (q) =>
          q.eq("userId", user._id).eq("primarySourceDocumentId", args.documentId),
        )
        .collect();

      await Promise.all(existing.map((a) => ctx.db.delete(a._id)));

      await ctx.db.insert("documentTopics", {
        documentId: args.documentId,
        topicId: args.topicId,
        userId: user._id,
        createdAt: Date.now(),
      });

      await Promise.all(
        postsForDocument.map((p) => ctx.db.patch(p._id, { topicId: args.topicId })),
      );

      // Counter denorm (B3): adjust on the new topic and on each replaced topic.
      await Promise.all([
        adjustTopicDocumentCount(ctx, args.topicId, +1),
        ...replacedTopicIds.map((id) => adjustTopicDocumentCount(ctx, id, -1)),
      ]);
      evt.set({ replacedAssignments: existing.length, postsRestamped: postsForDocument.length });

      await ctx.scheduler.runAfter(0, internal.topics.topicsActions.captureTopicAnalytics, {
        userId: user._id,
        payload: {
          // PostHog event name preserved across rename to avoid breaking analytics queries.
          event: "document_assigned_to_topic",
          properties: {
            topic_id: args.topicId,
            document_id: args.documentId,
          },
        },
      });

      return null;
    } catch (error) {
      evt.setError(error);
      throw error;
    } finally {
      evt.emit();
    }
  },
});

export const removeDocumentFromTopic = mutation({
  args: {
    documentId: v.id("documents"),
    topicId: v.id("topics"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const evt = new WideEvent("topics.removeDocumentFromTopic");
    evt.set({ documentId: args.documentId, topicId: args.topicId });
    try {
      const user = await requireAuth(ctx);
      evt.set("userId", user._id);

      const document = await ctx.db.get(args.documentId);
      if (!document || document.userId !== user._id) {
        throw new ConvexError({ code: "document_not_found" as const });
      }
      await requireOwnedTopic(ctx, { topicId: args.topicId, userId: user._id });

      const assignments = await ctx.db
        .query("documentTopics")
        .withIndex("by_documentId", (q) => q.eq("documentId", args.documentId))
        .collect();

      const matching = assignments.filter((a) => a.topicId === args.topicId);

      // Clear topicId on the document's posts so topic-scoped pagination (B1) drops them.
      const postsForDocument =
        matching.length > 0
          ? await ctx.db
              .query("posts")
              .withIndex("by_userId_document", (q) =>
                q.eq("userId", user._id).eq("primarySourceDocumentId", args.documentId),
              )
              .collect()
          : [];

      await Promise.all([
        ...matching.map((a) => ctx.db.delete(a._id)),
        ...postsForDocument
          .filter((p) => p.topicId === args.topicId)
          .map((p) => ctx.db.patch(p._id, { topicId: undefined })),
      ]);

      if (matching.length > 0) {
        await adjustTopicDocumentCount(ctx, args.topicId, -matching.length);
      }
      evt.set({ deleted: matching.length, postsCleared: postsForDocument.length });

      if (matching.length > 0) {
        await ctx.scheduler.runAfter(0, internal.topics.topicsActions.captureTopicAnalytics, {
          userId: user._id,
          payload: {
            event: "document_removed_from_topic",
            properties: { topic_id: args.topicId, document_id: args.documentId },
          },
        });
      }

      return null;
    } catch (error) {
      evt.setError(error);
      throw error;
    } finally {
      evt.emit();
    }
  },
});

export const setTopicLearningGoalEmbedding = internalMutation({
  args: {
    topicId: v.id("topics"),
    embedding: v.array(v.float64()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const topic = await ctx.db.get(args.topicId);
    if (!topic) return null;
    if (!topic.learningGoal || topic.learningGoal.trim().length === 0) return null;
    await ctx.db.patch(args.topicId, { learningGoalEmbedding: args.embedding });
    return null;
  },
});

export const cascadeDeleteByDocumentId = internalMutation({
  args: { documentId: v.id("documents") },
  returns: v.object({ deletedDocumentTopics: v.number() }),
  handler: async (ctx, args) => {
    const assignments = await ctx.db
      .query("documentTopics")
      .withIndex("by_documentId", (q) => q.eq("documentId", args.documentId))
      .collect();

    // Decrement counter on every topic that loses an assignment (B3).
    const perTopic = new Map<Id<"topics">, number>();
    for (const a of assignments) {
      const id = a.topicId as Id<"topics">;
      perTopic.set(id, (perTopic.get(id) ?? 0) + 1);
    }

    await Promise.all([
      ...assignments.map((a) => ctx.db.delete(a._id)),
      ...[...perTopic].map(([topicId, n]) => adjustTopicDocumentCount(ctx, topicId, -n)),
    ]);
    return { deletedDocumentTopics: assignments.length };
  },
});

async function requireOwnedTopic(
  ctx: QueryCtx | MutationCtx,
  params: { topicId: Id<"topics">; userId: string },
): Promise<Doc<"topics">> {
  const topic = await ctx.db.get(params.topicId);
  try {
    assertOwnedTopic(topic, params.userId);
  } catch (e) {
    if (e instanceof TopicValidationError) {
      throw new ConvexError({ code: "topic_not_found" as const });
    }
    throw e;
  }
  return topic as Doc<"topics">;
}

async function requireUniqueTopicName(
  ctx: MutationCtx,
  params: { userId: string; name: string; excludeTopicId?: Id<"topics"> },
): Promise<void> {
  const existing = await ctx.db
    .query("topics")
    .withIndex("by_userId_name", (q) => q.eq("userId", params.userId).eq("name", params.name))
    .first();
  if (existing && existing._id !== params.excludeTopicId) {
    throw new ConvexError({ code: "topic_name_in_use" as const });
  }
}

async function adjustTopicDocumentCount(
  ctx: MutationCtx,
  topicId: Id<"topics">,
  delta: number,
): Promise<void> {
  const topic = await ctx.db.get(topicId);
  if (!topic) return;
  const next = Math.max(0, (topic.documentCount ?? 0) + delta);
  await ctx.db.patch(topicId, { documentCount: next });
}

/**
 * Translates `TopicValidationError` thrown by pure validators into a plain `Error`
 * so the existing handler code keeps its previous behaviour (the original handlers
 * threw plain `Error` for validation failures and `ConvexError` for authorization
 * failures). Centralizing the unwrap here keeps callers terse.
 */
function applyValidation<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    if (e instanceof TopicValidationError) {
      throw new Error(e.message);
    }
    throw e;
  }
}
