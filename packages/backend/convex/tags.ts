import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { internalMutation, mutation, query } from "./_generated/server";
import { requireAuth, optionalAuth } from "./lib/functions";
import { tagSource } from "./lib/validators";

const MAX_TAG_NAME_LENGTH = 50;
const MAX_TAGS_PER_DOCUMENT = 20;

export function normalizeTagName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

function validateTagName(normalized: string) {
  if (normalized.length === 0) {
    throw new Error("Tag name cannot be empty");
  }
  if (normalized.length > MAX_TAG_NAME_LENGTH) {
    throw new Error("Tag name must be 50 characters or fewer.");
  }
}

function assertTagParity(
  docId: Id<"documents">,
  tagIds: Id<"tags">[],
  tagSources: ("ai" | "manual")[],
) {
  if (tagIds.length !== tagSources.length) {
    throw new Error(
      `Tag array parity violation on document ${docId}: tagIds=${tagIds.length}, tagSources=${tagSources.length}`,
    );
  }
}

export const listUserTags = query({
  args: {},
  handler: async (ctx) => {
    const user = await optionalAuth(ctx);
    if (!user) return [];
    return await ctx.db
      .query("tags")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();
  },
});

export const getDocumentTags = query({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    const user = await optionalAuth(ctx);
    if (!user) return [];

    const doc = await ctx.db.get(args.documentId);
    if (!doc || doc.userId !== user._id) return [];

    const tagIds = doc.tagIds ?? [];
    const tagSources = doc.tagSources ?? [];

    const tags = await Promise.all(tagIds.map((id) => ctx.db.get(id)));
    return tags
      .map((tag, i) => {
        if (!tag) return null;
        return {
          ...tag,
          source: tagSources[i] ?? ("manual" as const),
        };
      })
      .filter((t): t is NonNullable<typeof t> => t !== null);
  },
});

export const getDocumentTagsBatch = query({
  args: { documentIds: v.array(v.id("documents")) },
  handler: async (ctx, args) => {
    const user = await optionalAuth(ctx);
    if (!user) return {};

    const result: Record<string, { _id: Id<"tags">; name: string; source: "ai" | "manual" }[]> = {};

    const uniqueTagIds = new Set<Id<"tags">>();
    const docs = await Promise.all(args.documentIds.map((id) => ctx.db.get(id)));

    for (const doc of docs) {
      if (!doc || doc.userId !== user._id) continue;
      for (const tagId of doc.tagIds ?? []) {
        uniqueTagIds.add(tagId);
      }
    }

    const tagMap = new Map<Id<"tags">, { _id: Id<"tags">; name: string }>();
    const tagRecords = await Promise.all([...uniqueTagIds].map((id) => ctx.db.get(id)));
    for (const tag of tagRecords) {
      if (tag) tagMap.set(tag._id, { _id: tag._id, name: tag.name });
    }

    for (const doc of docs) {
      if (!doc || doc.userId !== user._id) continue;
      const tagIds = doc.tagIds ?? [];
      const tagSources = doc.tagSources ?? [];
      result[doc._id] = tagIds
        .map((id, i) => {
          const tag = tagMap.get(id);
          if (!tag) return null;
          return {
            _id: tag._id,
            name: tag.name,
            source: (tagSources[i] ?? "manual") as "ai" | "manual",
          };
        })
        .filter((t): t is NonNullable<typeof t> => t !== null);
    }

    return result;
  },
});

export const createTag = mutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const normalized = normalizeTagName(args.name);
    validateTagName(normalized);

    const existing = await ctx.db
      .query("tags")
      .withIndex("by_userId_normalizedName", (q) =>
        q.eq("userId", user._id).eq("normalizedName", normalized),
      )
      .first();

    if (existing) return existing._id;

    return await ctx.db.insert("tags", {
      name: args.name.trim(),
      normalizedName: normalized,
      userId: user._id,
      createdAt: Date.now(),
    });
  },
});

export const deleteTag = mutation({
  args: { tagId: v.id("tags") },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    const tag = await ctx.db.get(args.tagId);
    if (!tag || tag.userId !== user._id) {
      throw new Error("Tag not found");
    }

    const userDocs = await ctx.db
      .query("documents")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();

    for (const doc of userDocs) {
      const tagIds = doc.tagIds ?? [];
      const sources = doc.tagSources ?? [];
      assertTagParity(doc._id, tagIds, sources);
      const idx = tagIds.indexOf(args.tagId);
      if (idx !== -1) {
        const newTagIds = [...tagIds];
        newTagIds.splice(idx, 1);
        const newTagSources = [...sources];
        newTagSources.splice(idx, 1);
        assertTagParity(doc._id, newTagIds, newTagSources);
        await ctx.db.patch(doc._id, {
          tagIds: newTagIds,
          tagSources: newTagSources,
        });
      }
    }

    await ctx.db.delete(args.tagId);
  },
});

export const addTagToDocument = mutation({
  args: {
    documentId: v.id("documents"),
    name: v.string(),
    source: v.optional(tagSource),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    const doc = await ctx.db.get(args.documentId);
    if (!doc || doc.userId !== user._id) {
      throw new Error("Document not found");
    }

    const normalized = normalizeTagName(args.name);
    validateTagName(normalized);

    let tag = await ctx.db
      .query("tags")
      .withIndex("by_userId_normalizedName", (q) =>
        q.eq("userId", user._id).eq("normalizedName", normalized),
      )
      .first();

    if (!tag) {
      const tagId = await ctx.db.insert("tags", {
        name: args.name.trim(),
        normalizedName: normalized,
        userId: user._id,
        createdAt: Date.now(),
      });
      tag = (await ctx.db.get(tagId))!;
    }

    const tagIds = doc.tagIds ?? [];
    const sources = doc.tagSources ?? [];
    assertTagParity(args.documentId, tagIds, sources);

    if (tagIds.includes(tag._id)) {
      return tag._id;
    }

    if (tagIds.length >= MAX_TAGS_PER_DOCUMENT) {
      throw new Error(`Document cannot have more than ${MAX_TAGS_PER_DOCUMENT} tags.`);
    }

    const newTagIds = [...tagIds, tag._id];
    const newTagSources = [...sources, args.source ?? ("manual" as const)];
    assertTagParity(args.documentId, newTagIds, newTagSources);

    await ctx.db.patch(args.documentId, {
      tagIds: newTagIds,
      tagSources: newTagSources,
    });

    return tag._id;
  },
});

export const removeTagFromDocument = mutation({
  args: {
    documentId: v.id("documents"),
    tagId: v.id("tags"),
    tagName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    const doc = await ctx.db.get(args.documentId);
    if (!doc || doc.userId !== user._id) {
      throw new Error("Document not found");
    }

    const tagIds = doc.tagIds ?? [];
    const sources = doc.tagSources ?? [];
    assertTagParity(args.documentId, tagIds, sources);

    let idx = tagIds.indexOf(args.tagId);

    // Fallback: if the tagId wasn't found (e.g. optimistic ID), look up by name
    if (idx === -1 && args.tagName) {
      const normalized = normalizeTagName(args.tagName);
      const tag = await ctx.db
        .query("tags")
        .withIndex("by_userId_normalizedName", (q) =>
          q.eq("userId", user._id).eq("normalizedName", normalized),
        )
        .first();
      if (tag) {
        idx = tagIds.indexOf(tag._id);
      }
    }

    if (idx === -1) return;

    const newTagIds = [...tagIds];
    newTagIds.splice(idx, 1);
    const newTagSources = [...sources];
    newTagSources.splice(idx, 1);
    assertTagParity(args.documentId, newTagIds, newTagSources);

    await ctx.db.patch(args.documentId, {
      tagIds: newTagIds,
      tagSources: newTagSources,
    });
  },
});

export const listDocumentsByTag = query({
  args: { tagId: v.id("tags") },
  handler: async (ctx, args) => {
    const user = await optionalAuth(ctx);
    if (!user) return [];

    const docs = await ctx.db
      .query("documents")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();

    return docs.filter((doc) => doc.tagIds?.includes(args.tagId));
  },
});

export const addTagToDocumentInternal = internalMutation({
  args: {
    documentId: v.id("documents"),
    userId: v.string(),
    name: v.string(),
    source: tagSource,
  },
  handler: async (ctx, args) => {
    const normalized = normalizeTagName(args.name);
    if (normalized.length === 0) return null;
    if (normalized.length > MAX_TAG_NAME_LENGTH) return null;

    let tag = await ctx.db
      .query("tags")
      .withIndex("by_userId_normalizedName", (q) =>
        q.eq("userId", args.userId).eq("normalizedName", normalized),
      )
      .first();

    if (!tag) {
      const tagId = await ctx.db.insert("tags", {
        name: args.name.trim(),
        normalizedName: normalized,
        userId: args.userId,
        createdAt: Date.now(),
      });
      tag = (await ctx.db.get(tagId))!;
    }

    const doc = await ctx.db.get(args.documentId);
    if (!doc) return null;
    if (doc.userId !== args.userId) return null;

    const tagIds = doc.tagIds ?? [];
    const sources = doc.tagSources ?? [];
    assertTagParity(args.documentId, tagIds, sources);

    if (tagIds.includes(tag._id)) return tag._id;
    if (tagIds.length >= MAX_TAGS_PER_DOCUMENT) return null;

    const newTagIds = [...tagIds, tag._id];
    const newTagSources = [...sources, args.source];
    assertTagParity(args.documentId, newTagIds, newTagSources);

    await ctx.db.patch(args.documentId, {
      tagIds: newTagIds,
      tagSources: newTagSources,
    });

    return tag._id;
  },
});
