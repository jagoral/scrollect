import { v } from "convex/values";

import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { query } from "../_generated/server";
import { requireAuth } from "../lib/functions";
import { postType, typeData as typeDataValidator } from "../lib/validators";
import { FRESHNESS_WINDOW_MS } from "../../src/feed/logic/constants";

async function resolveTags(ctx: QueryCtx, tagIds: Id<"tags">[]) {
  const tags = await Promise.all(tagIds.map((id) => ctx.db.get(id)));
  return tags
    .filter((t): t is NonNullable<typeof t> => t !== null)
    .map((t) => ({ _id: t._id, name: t.name }));
}

async function resolveSectionSummary(
  ctx: QueryCtx,
  postDraftId?: Id<"postDrafts">,
): Promise<string | undefined> {
  if (!postDraftId) return undefined;
  const draft = await ctx.db.get(postDraftId);
  if (!draft?.sectionSummaryId) return undefined;
  const section = await ctx.db.get(draft.sectionSummaryId);
  return section?.summary;
}

const RELATED_POSTS_LIMIT_MAX = 10;

// v1: "related" means "same source document, newest first, excluding the
// current post and posts the user has disliked." Future iterations may layer
// in semantic similarity (Qdrant) or `connectionPairs` ranking.
export const listRelated = query({
  args: {
    postId: v.id("posts"),
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      _id: v.id("posts"),
      postType,
      summary: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    const sourcePost = await ctx.db.get(args.postId);
    if (!sourcePost || sourcePost.userId !== user._id) return [];

    const limit = Math.min(RELATED_POSTS_LIMIT_MAX, Math.max(1, args.limit ?? 3));

    const related: { _id: Id<"posts">; postType: Doc<"posts">["postType"]; summary: string }[] = [];
    for await (const post of ctx.db
      .query("posts")
      .withIndex("by_userId_document", (q) =>
        q.eq("userId", user._id).eq("primarySourceDocumentId", sourcePost.primarySourceDocumentId),
      )
      .order("desc")) {
      if (related.length >= limit) break;
      if (post._id === args.postId) continue;
      if (post.reaction === "dislike") continue;
      related.push({
        _id: post._id,
        postType: post.postType,
        summary: deriveTeaser(post),
      });
    }
    return related;
  },
});

function deriveTeaser(post: Doc<"posts">): string {
  const fromTypeData = teaserFromTypeData(post.typeData);
  const raw = fromTypeData ?? post.content ?? "";
  return toTeaser(raw);
}

function teaserFromTypeData(typeData: Doc<"posts">["typeData"]): string | undefined {
  switch (typeData.type) {
    case "quote":
      return typeData.quotedText;
    case "quiz":
      return typeData.question;
    case "summary":
      return typeData.bulletPoints[0];
    case "connection":
      return (
        typeData.sourceAKeyIdea ??
        typeData.sourceBKeyIdea ??
        `${typeData.sourceATitleHint} / ${typeData.sourceBTitleHint}`
      );
    case "insight":
      return undefined;
  }
}

const RELATED_TEASER_MAX_CHARS = 140;

function toTeaser(text: string): string {
  const plain = text
    .replace(/^\s*#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/`{1,3}([^`]*)`{1,3}/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1$2")
    .replace(/(^|[^_])_([^_]+)_/g, "$1$2")
    .replace(/\s+/g, " ")
    .trim();
  if (plain.length <= RELATED_TEASER_MAX_CHARS) return plain;
  return `${plain.slice(0, RELATED_TEASER_MAX_CHARS - 1).trimEnd()}…`;
}

// Enriched single-post fetch used by the detail panel when swapping in
// a related post. Mirrors the row shape returned by `feed.queries.list`
// (the fields the detail panel actually consumes), modulo `tags`.
export const getEnriched = query({
  args: { postId: v.id("posts") },
  returns: v.union(
    v.object({
      _id: v.id("posts"),
      content: v.string(),
      postType,
      typeData: typeDataValidator,
      primarySourceDocumentTitle: v.string(),
      primarySourceDocumentId: v.id("documents"),
      fileType: v.optional(v.string()),
      sectionTitle: v.union(v.string(), v.null()),
      pageStart: v.union(v.number(), v.null()),
      pageEnd: v.union(v.number(), v.null()),
      postDraftId: v.union(v.id("postDrafts"), v.null()),
      createdAt: v.number(),
      reaction: v.union(v.literal("like"), v.literal("dislike"), v.null()),
      isBookmarked: v.boolean(),
      isNew: v.boolean(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    const post = await ctx.db.get(args.postId);
    if (!post || post.userId !== user._id) return null;

    const [doc, bookmark] = await Promise.all([
      ctx.db.get(post.primarySourceDocumentId),
      ctx.db
        .query("bookmarks")
        .withIndex("by_userId_post", (q) => q.eq("userId", user._id).eq("postId", post._id))
        .first(),
    ]);
    if (!doc || doc.userId !== user._id) return null;

    // Date.now() is non-deterministic in Convex queries; isNew updates on the
    // next reactive re-evaluation, not at the exact 48h mark. Same trade-off
    // as `feed.queries.list`.
    const isNew = Date.now() - doc.createdAt < FRESHNESS_WINDOW_MS;

    return {
      _id: post._id,
      content: post.content,
      postType: post.postType,
      typeData: post.typeData,
      primarySourceDocumentTitle: post.primarySourceDocumentTitle,
      primarySourceDocumentId: post.primarySourceDocumentId,
      fileType: post.fileType,
      sectionTitle: post.sectionTitle ?? null,
      pageStart: post.pageStart ?? null,
      pageEnd: post.pageEnd ?? null,
      postDraftId: post.postDraftId ?? null,
      createdAt: post.createdAt,
      reaction: post.reaction ?? null,
      isBookmarked: bookmark != null,
      isNew,
    };
  },
});

export const getSourceDetails = query({
  args: { postId: v.id("posts") },
  returns: v.union(
    v.object({
      documentTitle: v.string(),
      fileType: v.optional(v.string()),
      sectionTitle: v.optional(v.string()),
      pageStart: v.optional(v.number()),
      pageEnd: v.optional(v.number()),
      sourceUrl: v.optional(v.string()),
      sectionSummary: v.optional(v.string()),
      learningGoal: v.optional(v.string()),
      tags: v.array(v.object({ _id: v.id("tags"), name: v.string() })),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    const post = await ctx.db.get(args.postId);
    if (!post || post.userId !== user._id) return null;

    const doc = await ctx.db.get(post.primarySourceDocumentId);
    if (!doc || doc.userId !== user._id) return null;

    const [tags, sectionSummary] = await Promise.all([
      resolveTags(ctx, doc.tagIds ?? []),
      resolveSectionSummary(ctx, post.postDraftId),
    ]);

    return {
      documentTitle: post.primarySourceDocumentTitle,
      fileType: post.fileType ?? doc.fileType,
      sectionTitle: post.sectionTitle,
      pageStart: post.pageStart,
      pageEnd: post.pageEnd,
      sourceUrl: doc.sourceUrl,
      sectionSummary,
      learningGoal: doc.learningGoal,
      tags,
    };
  },
});
