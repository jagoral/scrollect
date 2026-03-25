"use node";

import { customProvider, type Provider } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";

let _ai: Provider | null = null;

export function getAI(): Provider {
  if (!_ai) {
    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) throw new Error("OPENAI_API_KEY environment variable is required");

    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) throw new Error("GEMINI_API_KEY environment variable is required");

    const openai = createOpenAI({ apiKey: openaiKey });
    const google = createGoogleGenerativeAI({ apiKey: geminiKey });

    _ai = customProvider({
      languageModels: {
        classify: google("gemini-2.5-flash"),
        fast: google("gemini-2.5-flash"),
        generate: google("gemini-2.5-flash"),
        reason: google("gemini-2.5-flash"),
        premium: google("gemini-2.5-flash"),
        evaluate: google("gemini-2.5-flash"),
      },
      embeddingModels: {
        default: openai.embeddingModel("text-embedding-3-small"),
      },
    });
  }
  return _ai;
}
