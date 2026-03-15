"use node";

import { customProvider } from "ai";
import { createOpenAI } from "@ai-sdk/openai";

function getOpenAIProvider() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY environment variable is required");
  return createOpenAI({ apiKey });
}

const openai = getOpenAIProvider();

export const ai = customProvider({
  languageModels: {
    fast: openai("gpt-4o-mini"),
    powerful: openai("gpt-4o"),
  },
  embeddingModels: {
    default: openai.embeddingModel("text-embedding-3-small"),
  },
});
