import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ExpoPushClient, StubPushClient } from "../../../src/providers/push/expo";

function mockFetchOnce(body: unknown, init: { status?: number } = {}) {
  const fetchMock = vi.fn().mockResolvedValueOnce(
    new Response(JSON.stringify(body), {
      status: init.status ?? 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("ExpoPushClient", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns no outcomes for an empty input without calling fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const client = new ExpoPushClient();
    const outcomes = await client.send([]);
    expect(outcomes).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps OK tickets to status=ok with the receipt id", async () => {
    mockFetchOnce({
      data: [{ status: "ok", id: "receipt-1" }],
    });
    const client = new ExpoPushClient();
    const outcomes = await client.send([
      { token: "ExponentPushToken[abc]", title: "T", body: "B" },
    ]);
    expect(outcomes).toEqual([{ status: "ok", receiptId: "receipt-1" }]);
  });

  it("maps DeviceNotRegistered errors to invalid_token so the caller cleans them up", async () => {
    mockFetchOnce({
      data: [
        {
          status: "error",
          message: "device gone",
          details: { error: "DeviceNotRegistered" },
        },
      ],
    });
    const client = new ExpoPushClient();
    const outcomes = await client.send([{ token: "tok", title: "T", body: "B" }]);
    expect(outcomes[0]).toEqual({
      status: "invalid_token",
      reason: "DeviceNotRegistered",
    });
  });

  it("maps generic errors to status=error so the caller treats them as transient", async () => {
    mockFetchOnce({
      data: [
        {
          status: "error",
          message: "rate limited",
          details: { error: "MessageRateExceeded" },
        },
      ],
    });
    const client = new ExpoPushClient();
    const outcomes = await client.send([{ token: "tok", title: "T", body: "B" }]);
    expect(outcomes[0]).toEqual({ status: "error", reason: "rate limited" });
  });

  it("treats non-2xx HTTP responses as transient errors for every message in the batch", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response("upstream down", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new ExpoPushClient();
    const outcomes = await client.send([
      { token: "a", title: "T", body: "B" },
      { token: "b", title: "T", body: "B" },
    ]);
    expect(outcomes).toHaveLength(2);
    for (const outcome of outcomes) {
      expect(outcome.status).toBe("error");
    }
  });

  it("splits inputs over the 100-message Expo batch limit and aligns outcomes by index", async () => {
    const total = 250;
    const messages = Array.from({ length: total }, (_, i) => ({
      token: `tok-${i}`,
      title: "T",
      body: "B",
    }));

    let call = 0;
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const sent = JSON.parse(init.body as string) as Array<{ to: string }>;
      call += 1;
      // Fail the second batch with a single invalid_token slot at index 0 within
      // the batch; OK everywhere else. The stitched output should preserve the
      // failure at exactly the right global index (100).
      const data = sent.map((_msg, i) => {
        if (call === 2 && i === 0) {
          return { status: "error", details: { error: "DeviceNotRegistered" } };
        }
        return { status: "ok", id: `r-${call}-${i}` };
      });
      return new Response(JSON.stringify({ data }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new ExpoPushClient();
    const outcomes = await client.send(messages);

    expect(fetchMock).toHaveBeenCalledTimes(3); // 100 + 100 + 50
    expect(outcomes).toHaveLength(total);
    expect(outcomes[100]).toEqual({
      status: "invalid_token",
      reason: "DeviceNotRegistered",
    });
    expect(outcomes[0]?.status).toBe("ok");
    expect(outcomes[249]?.status).toBe("ok");
  });
});

describe("StubPushClient", () => {
  it("returns ok for every input without external calls", async () => {
    const client = new StubPushClient();
    const outcomes = await client.send([
      { token: "a", title: "T", body: "B" },
      { token: "b", title: "T", body: "B" },
    ]);
    expect(outcomes).toEqual([{ status: "ok" }, { status: "ok" }]);
  });
});
