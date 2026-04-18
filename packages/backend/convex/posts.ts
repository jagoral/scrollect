import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { query } from "./_generated/server";
import { requireAuth } from "./lib/functions";

async function resolveTags(ctx: QueryCtx, tagIds: Id<"tags">[]) {
  const tags = await Promise.all(tagIds.map((id) => ctx.db.get(id)));
  return tags
    .filter((t): t is NonNullable<typeof t> => t !== null)
    .map((t) => ({ _id: t._id, name: t.name }));
}

async function resolveSectionSummary(
  ctx: QueryCtx,
  cardDraftId?: Id<"cardDrafts">,
): Promise<string | undefined> {
  if (!cardDraftId) return undefined;
  const draft = await ctx.db.get(cardDraftId);
  if (!draft?.sectionSummaryId) return undefined;
  const section = await ctx.db.get(draft.sectionSummaryId);
  return section?.summary;
}

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
      resolveSectionSummary(ctx, post.cardDraftId),
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
