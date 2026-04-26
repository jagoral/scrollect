"use node";

import { v } from "convex/values";

import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { WideEvent } from "../../src/platform/logging";
import {
  DRAFT_POOL_THRESHOLD,
  buildDraftPoolPushMessages,
  partitionPushOutcomes,
} from "../../src/notifications/draftPoolPush";
import { captureEvent } from "../../src/providers/analytics/posthog";
import { createPushNotificationService } from "../../src/providers/wiring";

export const sendDraftPoolPush = internalAction({
  args: { userId: v.string() },
  returns: v.null(),
  handler: async (ctx, { userId }) => {
    const evt = new WideEvent("notifications.sendDraftPoolPush");
    evt.set({ userId });
    let budgetClaimed = false;

    try {
      const pendingCount = await ctx.runQuery(internal.drafting.postDrafts.countPendingForUser, {
        userId,
      });
      evt.set("pendingCount", pendingCount);
      if (pendingCount < DRAFT_POOL_THRESHOLD) {
        evt.set("skipped", "below_threshold");
        await capturePushSkipped(userId, "below_threshold", { pendingCount });
        return null;
      }

      const tokens = await ctx.runQuery(internal.notifications.tokens.listPushTokensForUser, {
        userId,
      });
      evt.set("tokenCount", tokens.length);
      if (tokens.length === 0) {
        evt.set("skipped", "no_tokens");
        await capturePushSkipped(userId, "no_tokens", { pendingCount });
        return null;
      }

      const budget = await ctx.runMutation(internal.notifications.tokens.claimDraftPoolPushBudget, {
        userId,
      });
      if (!budget.ok) {
        evt.set({ skipped: "throttled", retryAfter: budget.retryAfter });
        await capturePushSkipped(userId, "throttled", {
          pendingCount,
          retryAfter: budget.retryAfter,
        });
        return null;
      }
      budgetClaimed = true;

      const service = createPushNotificationService();
      const outcomes = await service.send(buildDraftPoolPushMessages(tokens));
      const { okCount, errorCount, invalidTokenIds } = partitionPushOutcomes(outcomes, tokens);

      if (invalidTokenIds.length > 0) {
        await ctx.runMutation(internal.notifications.tokens.deletePushTokensByIds, {
          ids: invalidTokenIds,
        });
      }

      // Refund the daily budget when the entire batch failed - a single Expo
      // outage shouldn't burn the user's only push slot for the day. Successful
      // partial deliveries still consume the budget (the user *did* receive a
      // push on at least one device).
      if (okCount === 0) {
        await ctx.runMutation(internal.notifications.tokens.releaseDraftPoolPushBudget, {
          userId,
        });
        budgetClaimed = false;
        evt.set("budgetReleased", true);
      }

      evt.set({
        sentCount: okCount,
        invalidTokenCount: invalidTokenIds.length,
        errorCount,
      });

      if (okCount > 0) {
        await captureEvent({
          distinctId: userId,
          event: "push_sent",
          properties: {
            reason: "draft_pool_refill",
            user_token_count: tokens.length,
            sent_count: okCount,
            invalid_token_count: invalidTokenIds.length,
            error_count: errorCount,
            pending_draft_count: pendingCount,
          },
        });
      } else {
        await captureEvent({
          distinctId: userId,
          event: "push_send_failed",
          properties: {
            reason: "draft_pool_refill",
            user_token_count: tokens.length,
            invalid_token_count: invalidTokenIds.length,
            error_count: errorCount,
            pending_draft_count: pendingCount,
          },
        });
      }
    } catch (error) {
      evt.setError(error);
      // Best-effort budget refund and analytics on unexpected failure so a
      // crash doesn't quietly disable push delivery for the user for 24h.
      if (budgetClaimed) {
        try {
          await ctx.runMutation(internal.notifications.tokens.releaseDraftPoolPushBudget, {
            userId,
          });
          evt.set("budgetReleased", true);
        } catch (releaseError) {
          evt.set("budgetReleaseError", String(releaseError));
        }
      }
      await captureEvent({
        distinctId: userId,
        event: "push_send_failed",
        properties: {
          reason: "draft_pool_refill",
          error: error instanceof Error ? error.message : String(error),
        },
      });
    } finally {
      evt.emit();
    }

    return null;
  },
});

async function capturePushSkipped(
  userId: string,
  reason: "below_threshold" | "no_tokens" | "throttled",
  properties: Record<string, unknown>,
): Promise<void> {
  await captureEvent({
    distinctId: userId,
    event: "push_skipped",
    properties: { reason, ...properties },
  });
}
