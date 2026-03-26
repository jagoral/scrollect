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
        classify: google("gemini-3.1-flash-lite-preview"),
        fast: google("gemini-3.1-flash-lite-preview"),
        generate: google("gemini-3.1-flash-lite-preview"),
        reason: google("gemini-3.1-flash-lite-preview"),
        premium: google("gemini-3.1-flash-lite-preview"),
        evaluate: google("gemini-2.5-flash"),
      },
      embeddingModels: {
        default: openai.embeddingModel("text-embedding-3-small"),
      },
    });
  }
  return _ai;
}
