import { generateText, Output } from "ai";
import { z } from "zod";

import type { TaggingLlm } from "./types";
import { type TokenUsage, getAI, normalizeUsage } from "./ai";

const tagSchema = z.object({ tags: z.array(z.string()) });

function buildTagSuggestionPrompt(): string {
  return `You are a topic classifier for a personal learning app.
Given text chunks from a document, suggest 3-5 topic tags that best describe the content.

Rules:
- Tags should be broad enough to apply across multiple documents (e.g., "machine learning" not "chapter 3 summary")
- Use natural language (e.g., "distributed systems", "React", "personal finance")
- Prefer well-known terms over jargon
- Tags must be in English, even if the source text is in another language
- Return 3-5 tags, no more

Return a JSON object: { "tags": ["tag1", "tag2", "tag3"] }`;
}

export class AiSdkTaggingLlm implements TaggingLlm {
  async suggestTags(opts: { prompt: string }): Promise<{ tags: string[]; usage: TokenUsage }> {
    const { output, usage } = await generateText({
      model: getAI().languageModel("classify"),
      output: Output.object({ schema: tagSchema }),
      system: buildTagSuggestionPrompt(),
      prompt: opts.prompt,
      temperature: 0.3,
      maxRetries: 2,
    });

    return {
      tags: output?.tags ?? [],
      usage: normalizeUsage(usage, "classify"),
    };
  }
}
