import { describe, expect, it } from "vitest";

import {
  DRAFT_POOL_THRESHOLD,
  PUSH_DEEP_LINK,
  buildDraftPoolPushMessages,
  partitionPushOutcomes,
} from "../../src/notifications/draftPoolPush";
import type { PushSendOutcome } from "../../src/providers/types";

describe("buildDraftPoolPushMessages", () => {
  it("emits one message per token with the deep-link payload the mobile bootstrap reads", () => {
    const messages = buildDraftPoolPushMessages([{ token: "tok-a" }, { token: "tok-b" }]);
    expect(messages).toHaveLength(2);
    for (const msg of messages) {
      expect(msg.title).toBeTruthy();
      expect(msg.body).toBeTruthy();
      expect(msg.data).toMatchObject({ route: PUSH_DEEP_LINK, reason: "draft_pool_refill" });
    }
    expect(messages.map((m) => m.token)).toEqual(["tok-a", "tok-b"]);
  });
});

describe("partitionPushOutcomes", () => {
  it("counts ok outcomes, surfaces invalid token ids, and counts transient errors", () => {
    const tokens = [{ _id: "id-1" }, { _id: "id-2" }, { _id: "id-3" }, { _id: "id-4" }];
    const outcomes: PushSendOutcome[] = [
      { status: "ok", receiptId: "r-1" },
      { status: "invalid_token", reason: "DeviceNotRegistered" },
      { status: "error", reason: "MessageRateExceeded" },
      { status: "ok" },
    ];
    expect(partitionPushOutcomes(outcomes, tokens)).toEqual({
      okCount: 2,
      errorCount: 1,
      invalidTokenIds: ["id-2"],
    });
  });

  it("returns zeros when both arrays are empty", () => {
    expect(partitionPushOutcomes([], [])).toEqual({
      okCount: 0,
      errorCount: 0,
      invalidTokenIds: [],
    });
  });
});

describe("DRAFT_POOL_THRESHOLD", () => {
  it("is at most the cap that the pending-count query takes - higher would silently truncate", () => {
    // The drafting/postDrafts query caps the read at PENDING_COUNT_CAP (100).
    // If the threshold ever exceeds the cap, sends would never fire because the
    // count would be clamped below the threshold. This guards that invariant.
    const PENDING_COUNT_CAP = 100;
    expect(DRAFT_POOL_THRESHOLD).toBeLessThan(PENDING_COUNT_CAP);
  });
});
