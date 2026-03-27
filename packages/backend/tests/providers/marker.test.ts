import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RunPodMarkerClient } from "../../src/providers/marker";

const MOCK_ENDPOINT_ID = "test-endpoint-123";
const MOCK_API_KEY = "test-api-key";

describe("RunPodMarkerClient", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: "job-abc123", status: "IN_QUEUE" }),
      }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("submits a job to RunPod and returns job ID", async () => {
    const client = new RunPodMarkerClient({
      endpointId: MOCK_ENDPOINT_ID,
      apiKey: MOCK_API_KEY,
    });

    const result = await client.submitJob({
      fileUrl: "https://storage.example.com/file.pdf",
      documentId: "doc-123",
      fileType: "pdf",
      webhookUrl: "https://example.convex.site/api/marker-webhook?secret=s3cret",
    });

    expect(result).toEqual({ kind: "submitted", jobId: "job-abc123" });

    const fetchCall = vi.mocked(fetch).mock.calls[0];
    expect(fetchCall[0]).toBe(`https://api.runpod.ai/v2/${MOCK_ENDPOINT_ID}/run`);

    const requestInit = fetchCall[1] as RequestInit;
    expect(requestInit.method).toBe("POST");
    expect(requestInit.headers).toEqual(
      expect.objectContaining({
        Authorization: `Bearer ${MOCK_API_KEY}`,
      }),
    );

    const body = JSON.parse(requestInit.body as string);
    expect(body.input.file_url).toBe("https://storage.example.com/file.pdf");
    expect(body.input.document_id).toBe("doc-123");
    expect(body.input.file_type).toBe("pdf");
    expect(body.webhook).toBe("https://example.convex.site/api/marker-webhook?secret=s3cret");
  });

  it("throws on non-OK response", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => "Rate limited",
    } as Response);

    const client = new RunPodMarkerClient({
      endpointId: MOCK_ENDPOINT_ID,
      apiKey: MOCK_API_KEY,
    });

    await expect(
      client.submitJob({
        fileUrl: "https://storage.example.com/file.pdf",
        documentId: "doc-123",
        fileType: "pdf",
        webhookUrl: "https://example.convex.site/api/marker-webhook",
      }),
    ).rejects.toThrow("RunPod submit failed: 429 Rate limited");
  });

  it("throws when response has no job ID", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({}),
    } as Response);

    const client = new RunPodMarkerClient({
      endpointId: MOCK_ENDPOINT_ID,
      apiKey: MOCK_API_KEY,
    });

    await expect(
      client.submitJob({
        fileUrl: "https://storage.example.com/file.pdf",
        documentId: "doc-123",
        fileType: "pdf",
        webhookUrl: "https://example.convex.site/api/marker-webhook",
      }),
    ).rejects.toThrow("RunPod submit failed: no job ID in response");
  });
});
