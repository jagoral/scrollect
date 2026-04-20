import { PostHog } from "posthog-node";
import type { ModelAlias, TokenUsage } from "../llm/models";

let _client: PostHog | null = null;

function getClient(): PostHog | null {
  if (_client) return _client;
  const apiKey = process.env.POSTHOG_API_KEY;
  if (!apiKey) return null;
  _client = new PostHog(apiKey, {
    host: process.env.POSTHOG_HOST || "https://eu.i.posthog.com",
    flushInterval: 5000,
  });
  return _client;
}

export async function captureEvent({
  distinctId,
  event,
  properties,
}: {
  distinctId: string;
  event: string;
  properties?: Record<string, unknown>;
}) {
  try {
    const client = getClient();
    if (!client) return;
    client.capture({ distinctId, event, properties });
    await client.flush();
  } catch (error) {
    console.warn("Analytics captureEvent failed:", error);
  }
}

export async function captureAiUsage({
  distinctId,
  operation,
  usage,
  model,
  documentId,
}: {
  distinctId: string;
  operation: string;
  usage: TokenUsage;
  model: ModelAlias;
  documentId?: string;
}) {
  try {
    await captureEvent({
      distinctId,
      event: "ai.tokens_used",
      properties: {
        operation,
        ...(documentId ? { document_id: documentId } : {}),
        model,
        input_tokens: usage.inputTokens,
        output_tokens: usage.outputTokens,
        total_tokens: usage.totalTokens,
        cost_usd_input: usage.costUsd.input,
        cost_usd_output: usage.costUsd.output,
        estimated_cost_usd: Math.round(usage.costUsd.total * 1_000_000) / 1_000_000,
      },
    });
  } catch (error) {
    console.warn("Analytics captureAiUsage failed:", error);
  }
}
