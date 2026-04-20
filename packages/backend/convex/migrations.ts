import { Migrations } from "@convex-dev/migrations";
import { components, internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";

export const migrations = new Migrations<DataModel>(components.migrations);

/**
 * Generic runner for schema-table migrations defined with `migrations.define()`.
 * Usage: `npx convex run migrations:run '{"fn": "migrations:<name>"}'`.
 */
export const run = migrations.runner();

/**
 * Card->Post rename, widen-migrate-narrow step 1: copy every `cardDrafts` row
 * into a matching `postDrafts` row, renaming `cardType` to `postType` and
 * stamping `legacyCardDraftId` so the follow-up remap migrations can find it.
 */
export const migrateCardDraftsToPostDrafts = migrations.define({
  table: "cardDrafts",
  migrateOne: async (ctx, cardDraft) => {
    const existing = await ctx.db
      .query("postDrafts")
      .withIndex("by_legacyCardDraftId", (q) => q.eq("legacyCardDraftId", cardDraft._id))
      .first();
    if (existing) return;

    await ctx.db.insert("postDrafts", {
      documentId: cardDraft.documentId,
      sectionSummaryId: cardDraft.sectionSummaryId,
      userId: cardDraft.userId,
      postType: cardDraft.cardType,
      content: cardDraft.content,
      typeData: cardDraft.typeData,
      sourceChunkIds: cardDraft.sourceChunkIds,
      contentHash: cardDraft.contentHash,
      qualityScore: cardDraft.qualityScore,
      semanticQualityScore: cardDraft.semanticQualityScore,
      sectionQualitySignal: cardDraft.sectionQualitySignal,
      status: cardDraft.status,
      servedCount: cardDraft.servedCount,
      generationBatch: cardDraft.generationBatch,
      strategy: cardDraft.strategy,
      rejectionReason: cardDraft.rejectionReason,
      createdAt: cardDraft.createdAt,
      legacyCardDraftId: cardDraft._id,
    });
  },
});

/**
 * Step 2: rewrite `posts.cardDraftId` to `posts.postDraftId` using the
 * `legacyCardDraftId` mapping stamped in step 1. Clears the legacy field.
 */
export const migratePostsCardDraftReferences = migrations.define({
  table: "posts",
  migrateOne: async (ctx, post) => {
    if (post.cardDraftId === undefined) return;
    const newDraft = await ctx.db
      .query("postDrafts")
      .withIndex("by_legacyCardDraftId", (q) => q.eq("legacyCardDraftId", post.cardDraftId))
      .first();
    await ctx.db.patch(post._id, {
      postDraftId: newDraft?._id,
      cardDraftId: undefined,
    });
  },
});

/**
 * Step 3: same remap for `reactionFeedback`. Rows whose referenced cardDraft
 * cannot be found (orphans) have `cardDraftId` cleared without setting a new
 * `postDraftId`; the follow-up narrow commit tolerates this because the
 * `reactionFeedback` table is deleted with its owning posts in normal cascade.
 */
export const migrateReactionFeedbackCardDraftReferences = migrations.define({
  table: "reactionFeedback",
  migrateOne: async (ctx, row) => {
    if (row.cardDraftId === undefined) return;
    const newDraft = await ctx.db
      .query("postDrafts")
      .withIndex("by_legacyCardDraftId", (q) => q.eq("legacyCardDraftId", row.cardDraftId))
      .first();
    await ctx.db.patch(row._id, {
      postDraftId: newDraft?._id,
      cardDraftId: undefined,
    });
  },
});

/**
 * Step 4: drop the now-copied `cardDrafts` rows. Safe because steps 2-3 have
 * cleared every `cardDraftId` reference (posts + reactionFeedback).
 */
export const cleanupCardDrafts = migrations.define({
  table: "cardDrafts",
  migrateOne: async (ctx, cardDraft) => {
    await ctx.db.delete(cardDraft._id);
  },
});

/**
 * Step 5: strip `legacyCardDraftId` off every `postDrafts` row so the narrow
 * commit can remove the field from the schema without rejecting stored docs.
 */
export const clearPostDraftsLegacyId = migrations.define({
  table: "postDrafts",
  migrateOne: (_ctx, doc) => {
    if (doc.legacyCardDraftId === undefined) return;
    return { legacyCardDraftId: undefined };
  },
});

/**
 * Public entrypoint for deploy-time migrations, invoked by `scripts/vercel-build.sh`
 * via `npx convex run migrations:runAll`. Must be a public `action` so the CLI
 * can call it; Convex's CLI cannot invoke `internalAction`s.
 *
 * Each step is idempotent and resumable: `@convex-dev/migrations` skips completed
 * runs automatically, and the per-row handlers no-op when their precondition
 * (a missing field, an already-migrated row) is already true. If a step fails
 * the deploy aborts - re-running resumes from the last committed cursor.
 */
export const runAll = migrations.runner([
  internal.migrations.migrateCardDraftsToPostDrafts,
  internal.migrations.migratePostsCardDraftReferences,
  internal.migrations.migrateReactionFeedbackCardDraftReferences,
  internal.migrations.cleanupCardDrafts,
  internal.migrations.clearPostDraftsLegacyId,
]);
