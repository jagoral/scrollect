"use node";

import { generateText, Output } from "ai";
import { z } from "zod";

import type { CardGenerationService, TokenUsage } from "./types";
import { getAI } from "./ai";

const cardSchema = z
  .object({
    type: z.string(),
    content: z.string(),
    sourceChunkIndices: z.array(z.number()),
  })
  .passthrough();

function buildCardsSchema(cardCount: number) {
  return z.object({
    cards: z.array(cardSchema).min(cardCount).max(cardCount),
  });
}

export class AiSdkCardGenerator implements CardGenerationService {
  async generateCards(opts: {
    systemPrompt: string;
    userPrompt: string;
    cardCount: number;
    language?: string;
  }): Promise<{ cards: Record<string, unknown>[]; usage: TokenUsage }> {
    const { output, usage } = await generateText({
      model: getAI().languageModel("premium"),
      output: Output.object({ schema: buildCardsSchema(opts.cardCount) }),
      system: opts.systemPrompt,
      prompt: opts.userPrompt,
      temperature: 0.7,
      maxRetries: 2,
    });

    return {
      cards: (output?.cards ?? []) as Record<string, unknown>[],
      usage: {
        inputTokens: usage.inputTokens ?? 0,
        outputTokens: usage.outputTokens ?? 0,
        totalTokens: usage.totalTokens ?? 0,
      },
    };
  }
}
