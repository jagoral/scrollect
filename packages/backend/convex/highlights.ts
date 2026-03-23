import { ConvexError, v } from "convex/values";

import { internalMutation, mutation, query } from "./_generated/server";
import { requireAuth } from "./lib/functions";
import { WideEvent } from "./lib/logging";
import { highlightSource } from "./lib/validators";

const parsedHighlight = v.object({
  externalId: v.string(),
  text: v.string(),
  note: v.optional(v.string()),
  pageNumber: v.optional(v.number()),
  sourceMetadata: v.optional(v.record(v.string(), v.string())),
});

export const importHighlights = mutation({
  args: {
    documentId: v.id("documents"),
    source: highlightSource,
    highlights: v.array(parsedHighlight),
  },
  returns: v.object({
    imported: v.number(),
    skipped: v.number(),
    total: v.number(),
  }),
  handler: async (ctx, args) => {
    const evt = new WideEvent("highlights.importHighlights");
    evt.set({ documentId: args.documentId, source: args.source, total: args.highlights.length });

    try {
      const user = await requireAuth(ctx);
      evt.set("userId", user._id);

      const doc = await ctx.db.get(args.documentId);
      if (!doc || doc.userId !== user._id) {
        throw new ConvexError({ kind: "NotFound" as const, message: "Document not found" });
      }
      if (doc.status !== "ready") {
        throw new ConvexError({
          kind: "InvalidState" as const,
          message: "Highlights can only be imported to documents that have finished processing",
        });
      }

      const now = Date.now();
      let imported = 0;
      let skipped = 0;

      const toInsert = [];
      for (const highlight of args.highlights) {
        const existing = await ctx.db
          .query("highlights")
          .withIndex("by_userId_externalId", (q) =>
            q.eq("userId", user._id).eq("externalId", highlight.externalId),
          )
          .first();

        if (existing) {
          skipped++;
          continue;
        }

        toInsert.push(highlight);
      }

      await Promise.all(
        toInsert.map((highlight) =>
          ctx.db.insert("highlights", {
            documentId: args.documentId,
            text: highlight.text,
            note: highlight.note,
            pageNumber: highlight.pageNumber,
            sourceMetadata: highlight.sourceMetadata,
            externalId: highlight.externalId,
            source: args.source,
            userId: user._id,
            createdAt: now,
          }),
        ),
      );
      imported = toInsert.length;

      evt.set({ imported, skipped });
      return { imported, skipped, total: args.highlights.length };
    } catch (error) {
      evt.setError(error);
      throw error;
    } finally {
      evt.emit();
    }
  },
});

export const listByDocument = query({
  args: { documentId: v.id("documents") },
  returns: v.array(
    v.object({
      _id: v.id("highlights"),
      _creationTime: v.number(),
      documentId: v.id("documents"),
      text: v.string(),
      note: v.optional(v.string()),
      pageNumber: v.optional(v.number()),
      externalId: v.string(),
      source: highlightSource,
      sourceMetadata: v.optional(v.record(v.string(), v.string())),
      userId: v.string(),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    const doc = await ctx.db.get(args.documentId);
    if (!doc || doc.userId !== user._id) return [];

    const highlights = await ctx.db
      .query("highlights")
      .withIndex("by_userId_documentId", (q) =>
        q.eq("userId", user._id).eq("documentId", args.documentId),
      )
      .take(200);

    return highlights.sort((a, b) => (a.pageNumber ?? 0) - (b.pageNumber ?? 0));
  },
});

export const deleteByDocument = mutation({
  args: { documentId: v.id("documents") },
  returns: v.object({ deleted: v.number() }),
  handler: async (ctx, args) => {
    const evt = new WideEvent("highlights.deleteByDocument");
    evt.set("documentId", args.documentId);

    try {
      const user = await requireAuth(ctx);
      evt.set("userId", user._id);

      const [doc, highlights] = await Promise.all([
        ctx.db.get(args.documentId),
        ctx.db
          .query("highlights")
          .withIndex("by_userId_documentId", (q) =>
            q.eq("userId", user._id).eq("documentId", args.documentId),
          )
          .collect(),
      ]);
      if (!doc || doc.userId !== user._id) {
        throw new ConvexError({ kind: "NotFound" as const, message: "Document not found" });
      }

      for (const highlight of highlights) {
        await ctx.db.delete(highlight._id);
      }

      evt.set("deleted", highlights.length);
      return { deleted: highlights.length };
    } catch (error) {
      evt.setError(error);
      throw error;
    } finally {
      evt.emit();
    }
  },
});

export const cascadeDeleteHighlights = internalMutation({
  args: {
    documentId: v.id("documents"),
    userId: v.string(),
  },
  returns: v.object({ deletedHighlights: v.number() }),
  handler: async (ctx, args) => {
    const highlights = await ctx.db
      .query("highlights")
      .withIndex("by_userId_documentId", (q) =>
        q.eq("userId", args.userId).eq("documentId", args.documentId),
      )
      .collect();

    for (const highlight of highlights) {
      await ctx.db.delete(highlight._id);
    }

    return { deletedHighlights: highlights.length };
  },
});
