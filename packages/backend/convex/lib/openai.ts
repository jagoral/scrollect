"use node";

import OpenAI from "openai";

import type { WideEvent } from "./logging";

export function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY environment variable is required");
  return new OpenAI({ apiKey });
}

type CallOpenAIWithRetryArgs = {
  openai: OpenAI;
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
  model: string;
  temperature?: number;
  maxRetries?: number;
  baseDelayMs?: number;
  evt: WideEvent;
};

export async function callOpenAIWithRetry(args: CallOpenAIWithRetryArgs): Promise<string> {
  const {
    openai,
    messages,
    model,
    temperature = 0.7,
    maxRetries = 2,
    baseDelayMs = 2000,
    evt,
  } = args;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await openai.chat.completions.create({
        model,
        messages,
        temperature,
        response_format: { type: "json_object" },
      });
      return response.choices[0]?.message?.content ?? "{}";
    } catch (error: unknown) {
      const status = (error as { status?: number }).status ?? 0;
      const isRetryable =
        error instanceof Error &&
        (error.message.includes("rate_limit") ||
          error.message.includes("timeout") ||
          status === 429 ||
          status >= 500);

      if (!isRetryable || attempt === maxRetries) throw error;

      const delay = baseDelayMs * Math.pow(2, attempt);
      evt.set(`retry_${attempt}`, delay);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw new Error("Exhausted retries");
}
