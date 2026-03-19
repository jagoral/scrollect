"use node";

import { PostHog } from "posthog-node";

let _client: PostHog | null = null;

function getPostHogClient(): PostHog | null {
  if (_client) return _client;
  const apiKey = process.env.POSTHOG_API_KEY;
  if (!apiKey) return null;
  _client = new PostHog(apiKey, {
    host: process.env.POSTHOG_HOST || "https://eu.i.posthog.com",
    flushAt: 1,
    flushInterval: 0,
  });
  return _client;
}

export function captureEvent({
  distinctId,
  event,
  properties,
}: {
  distinctId: string;
  event: string;
  properties?: Record<string, unknown>;
}) {
  const client = getPostHogClient();
  if (!client) return;
  client.capture({ distinctId, event, properties });
}

const GPT4O_MINI_INPUT_COST = 0.15 / 1_000_000;
const GPT4O_MINI_OUTPUT_COST = 0.6 / 1_000_000;
const EMBEDDING_COST = 0.02 / 1_000_000;

export function captureAiUsage({
  distinctId,
  operation,
  documentId,
  usage,
  model,
}: {
  distinctId: string;
  operation: string;
  documentId?: string;
  usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number; tokens?: number };
  model: "llm" | "embedding";
}) {
  const inputTokens = usage.inputTokens ?? 0;
  const outputTokens = usage.outputTokens ?? 0;
  const totalTokens = usage.totalTokens ?? usage.tokens ?? inputTokens + outputTokens;

  let estimatedCostUsd: number;
  if (model === "embedding") {
    estimatedCostUsd = totalTokens * EMBEDDING_COST;
  } else {
    estimatedCostUsd = inputTokens * GPT4O_MINI_INPUT_COST + outputTokens * GPT4O_MINI_OUTPUT_COST;
  }

  captureEvent({
    distinctId,
    event: "ai.tokens_used",
    properties: {
      operation,
      document_id: documentId,
      model: model === "embedding" ? "text-embedding-3-small" : "gpt-4o-mini",
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: totalTokens,
      estimated_cost_usd: Math.round(estimatedCostUsd * 1_000_000) / 1_000_000,
    },
  });
}
