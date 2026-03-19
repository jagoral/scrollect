"use node";

import { PostHog } from "posthog-node";

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
    const apiKey = process.env.POSTHOG_API_KEY;
    if (!apiKey) return;
    const client = new PostHog(apiKey, {
      host: process.env.POSTHOG_HOST || "https://eu.i.posthog.com",
    });
    client.capture({ distinctId, event, properties });
    await client.shutdown();
  } catch {
    // Analytics must never crash the pipeline
  }
}

// Cost constants for GPT-4o-mini (gpt-4o-mini-2024-07-18)
const GPT4O_MINI_INPUT_COST = 0.15 / 1_000_000;
const GPT4O_MINI_OUTPUT_COST = 0.6 / 1_000_000;
// Cost constant for text-embedding-3-small
const EMBEDDING_COST = 0.02 / 1_000_000;

export async function captureAiUsage({
  distinctId,
  operation,
  documentId,
  usage,
  modelType,
}: {
  distinctId: string;
  operation: string;
  documentId?: string;
  usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number; tokens?: number };
  modelType: "llm" | "embedding";
}) {
  const inputTokens = usage.inputTokens ?? 0;
  const outputTokens = usage.outputTokens ?? 0;
  const totalTokens = usage.totalTokens ?? usage.tokens ?? inputTokens + outputTokens;

  let estimatedCostUsd: number;
  if (modelType === "embedding") {
    estimatedCostUsd = totalTokens * EMBEDDING_COST;
  } else {
    estimatedCostUsd = inputTokens * GPT4O_MINI_INPUT_COST + outputTokens * GPT4O_MINI_OUTPUT_COST;
  }

  await captureEvent({
    distinctId,
    event: "ai.tokens_used",
    properties: {
      operation,
      document_id: documentId,
      model: modelType === "embedding" ? "text-embedding-3-small" : "gpt-4o-mini",
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: totalTokens,
      estimated_cost_usd: Math.round(estimatedCostUsd * 1_000_000) / 1_000_000,
    },
  });
}
