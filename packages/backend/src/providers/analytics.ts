import { PostHog } from "posthog-node";

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

// Default cost constants for GPT-4o-mini (gpt-4o-mini-2024-07-18)
const DEFAULT_LLM_INPUT_COST = 0.15 / 1_000_000;
const DEFAULT_LLM_OUTPUT_COST = 0.6 / 1_000_000;
// Default cost constant for text-embedding-3-small
const DEFAULT_EMBEDDING_COST = 0.02 / 1_000_000;

export async function captureAiUsage({
  distinctId,
  operation,
  usage,
  modelType,
  documentId,
  model,
  inputCostPer1M,
  outputCostPer1M,
}: {
  distinctId: string;
  operation: string;
  usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number; tokens?: number };
  modelType: "llm" | "embedding";
  documentId?: string;
  model?: string;
  inputCostPer1M?: number;
  outputCostPer1M?: number;
}) {
  const inputTokens = usage.inputTokens ?? 0;
  const outputTokens = usage.outputTokens ?? 0;
  const totalTokens = usage.totalTokens ?? usage.tokens ?? inputTokens + outputTokens;

  const inputCostPerToken = inputCostPer1M
    ? inputCostPer1M / 1_000_000
    : modelType === "embedding"
      ? DEFAULT_EMBEDDING_COST
      : DEFAULT_LLM_INPUT_COST;
  const outputCostPerToken = outputCostPer1M
    ? outputCostPer1M / 1_000_000
    : modelType === "embedding"
      ? 0
      : DEFAULT_LLM_OUTPUT_COST;

  let estimatedCostUsd: number;
  if (modelType === "embedding") {
    estimatedCostUsd = totalTokens * inputCostPerToken;
  } else {
    estimatedCostUsd = inputTokens * inputCostPerToken + outputTokens * outputCostPerToken;
  }

  const resolvedModel =
    model ?? (modelType === "embedding" ? "text-embedding-3-small" : "gpt-4o-mini");

  try {
    await captureEvent({
      distinctId,
      event: "ai.tokens_used",
      properties: {
        operation,
        ...(documentId ? { document_id: documentId } : {}),
        model: resolvedModel,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: totalTokens,
        estimated_cost_usd: Math.round(estimatedCostUsd * 1_000_000) / 1_000_000,
      },
    });
  } catch (error) {
    console.warn("Analytics captureAiUsage failed:", error);
  }
}
