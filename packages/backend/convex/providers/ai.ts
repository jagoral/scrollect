"use node";

import { customProvider, type Provider } from "ai";
import { createOpenAI } from "@ai-sdk/openai";

let _ai: Provider | null = null;

export function getAI(): Provider {
  if (!_ai) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY environment variable is required");
    const openai = createOpenAI({ apiKey });
    _ai = customProvider({
      languageModels: {
        fast: openai("gpt-4o-mini"),
        powerful: openai("gpt-4o"),
      },
      embeddingModels: {
        default: openai.embeddingModel("text-embedding-3-small"),
      },
    });
  }
  return _ai;
}
