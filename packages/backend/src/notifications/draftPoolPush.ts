import type { PushNotificationMessage, PushSendOutcome } from "../providers/types";

/**
 * Pending-drafts threshold above which a refill push fires. Anything below means
 * replenishment didn't actually grow the pool meaningfully (e.g. small docs or many
 * batches failed) and a "fresh content" push would be misleading.
 */
export const DRAFT_POOL_THRESHOLD = 10;

export const PUSH_TITLE = "New posts in Scrollect";
export const PUSH_BODY = "Your feed just got fresh insights. Tap to keep learning.";
export const PUSH_DEEP_LINK = "/(tabs)/feed";

/**
 * Build the push payload for a draft-pool refill notification, one message per
 * registered token. The data payload is what the mobile bootstrap reads to deep-link
 * into the feed when the user taps.
 */
export function buildDraftPoolPushMessages(
  tokens: Array<{ token: string }>,
): PushNotificationMessage[] {
  return tokens.map((t) => ({
    token: t.token,
    title: PUSH_TITLE,
    body: PUSH_BODY,
    data: { route: PUSH_DEEP_LINK, reason: "draft_pool_refill" },
  }));
}

export interface PartitionedOutcomes<TokenId> {
  okCount: number;
  errorCount: number;
  invalidTokenIds: TokenId[];
}

/**
 * Split per-message outcomes into the three buckets the orchestration needs:
 * successful sends, transient errors (retried by the next replenishment), and
 * permanent invalid-token failures whose rows must be deleted. Keeps the loop
 * pure so the orchestration test harness doesn't need a Convex action surface.
 */
export function partitionPushOutcomes<TokenId>(
  outcomes: PushSendOutcome[],
  tokens: Array<{ _id: TokenId }>,
): PartitionedOutcomes<TokenId> {
  const invalidTokenIds: TokenId[] = [];
  let okCount = 0;
  let errorCount = 0;
  for (let i = 0; i < outcomes.length; i++) {
    const outcome = outcomes[i]!;
    if (outcome.status === "ok") okCount++;
    else if (outcome.status === "invalid_token") invalidTokenIds.push(tokens[i]!._id);
    else errorCount++;
  }
  return { okCount, errorCount, invalidTokenIds };
}
