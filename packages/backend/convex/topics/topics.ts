import { ConvexError, v } from "convex/values";

import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { mutation, query, internalMutation } from "../_generated/server";
import { requireAuth, optionalAuth } from "../lib/functions";
import { WideEvent } from "../../src/platform/logging";

const NAME_MAX_LENGTH = 80;
const LEARNING_GOAL_MAX_LENGTH = 500;
const DESCRIPTION_MAX_LENGTH = 1000;
const APPEARANCE_MAX_LENGTH = 32;

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

    const counts = await Promise.all(
      topics.map(async (topic) => {
        const assignments = await ctx.db
          .query("documentTopics")
          .withIndex("by_topicId", (q) => q.eq("topicId", topic._id))
          .collect();
        return assignments.length;
      }),
    );

    return topics.map((topic, idx) => ({ ...topic, documentCount: counts[idx] ?? 0 }));
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
      topic,
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
    if (assignments.length === 0) return null;

    const mostRecent = assignments.reduce((best, current) =>
      current.createdAt > best.createdAt ? current : best,
    );
    const topic = await ctx.db.get(mostRecent.topicId);
    if (!topic || topic.userId !== user._id) return null;
    return topic;
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
      if (assignments.length === 0) continue;
      const mostRecent = assignments.reduce((best, current) =>
        current.createdAt > best.createdAt ? current : best,
      );
      const topic = topicMap.get(mostRecent.topicId);
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

      const name = validateName(args.name);
      const learningGoal = validateLearningGoal(args.learningGoal);
      const description = sanitizeDescription(args.description);
      const color = sanitizeAppearance(args.color, "color");
      const icon = sanitizeAppearance(args.icon, "icon");

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
        createdAt: Date.now(),
      });
      evt.set({ topicId });

      await ctx.scheduler.runAfter(0, internal.topics.topicsActions.embedTopicGoal, {
        topicId,
        learningGoal,
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
        const nextName = validateName(args.name);
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
        update.description = sanitizeDescription(args.description) ?? "";
      }
      if (args.color !== undefined) {
        update.color = sanitizeAppearance(args.color, "color") ?? "";
      }
      if (args.icon !== undefined) {
        update.icon = sanitizeAppearance(args.icon, "icon") ?? "";
      }

      let goalChanged = false;
      let nextGoal: string | undefined;
      if (args.learningGoal !== undefined) {
        nextGoal = validateLearningGoal(args.learningGoal);
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

      await Promise.all([
        ...assignments.map((a) => ctx.db.delete(a._id)),
        ctx.db.delete(args.topicId),
      ]);
      evt.set({ documentCount: assignments.length });

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

export const assignDocumentToTopic = mutation({
  args: {
    documentId: v.id("documents"),
    topicId: v.id("topics"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const evt = new WideEvent("topics.assignDocumentToTopic");
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

      await Promise.all(existing.map((a) => ctx.db.delete(a._id)));

      await ctx.db.insert("documentTopics", {
        documentId: args.documentId,
        topicId: args.topicId,
        userId: user._id,
        createdAt: Date.now(),
      });

      await ctx.scheduler.runAfter(0, internal.topics.topicsActions.captureTopicAnalytics, {
        userId: user._id,
        payload: {
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
      await Promise.all(matching.map((a) => ctx.db.delete(a._id)));
      evt.set({ deleted: matching.length });

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
    await Promise.all(assignments.map((a) => ctx.db.delete(a._id)));
    return { deletedDocumentTopics: assignments.length };
  },
});

async function requireOwnedTopic(
  ctx: QueryCtx | MutationCtx,
  params: { topicId: Id<"topics">; userId: string },
): Promise<Doc<"topics">> {
  const topic = await ctx.db.get(params.topicId);
  if (!topic || topic.userId !== params.userId) {
    throw new ConvexError({ code: "topic_not_found" as const });
  }
  return topic;
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

function validateName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new Error("Topic name cannot be empty");
  }
  if (trimmed.length > NAME_MAX_LENGTH) {
    throw new Error(`Topic name must be at most ${NAME_MAX_LENGTH} characters`);
  }
  return trimmed;
}

function validateLearningGoal(goal: string): string {
  const trimmed = goal.trim();
  if (trimmed.length === 0) {
    throw new Error("Learning goal cannot be empty");
  }
  if (trimmed.length > LEARNING_GOAL_MAX_LENGTH) {
    throw new Error(`Learning goal must be at most ${LEARNING_GOAL_MAX_LENGTH} characters`);
  }
  return trimmed;
}

function sanitizeDescription(description: string | undefined): string | undefined {
  if (description === undefined) return undefined;
  const trimmed = description.trim();
  if (trimmed.length === 0) return undefined;
  if (trimmed.length > DESCRIPTION_MAX_LENGTH) {
    throw new Error(`Description must be at most ${DESCRIPTION_MAX_LENGTH} characters`);
  }
  return trimmed;
}

function sanitizeAppearance(
  value: string | undefined,
  field: "color" | "icon",
): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  if (trimmed.length > APPEARANCE_MAX_LENGTH) {
    throw new Error(`Topic ${field} must be at most ${APPEARANCE_MAX_LENGTH} characters`);
  }
  return trimmed;
}
