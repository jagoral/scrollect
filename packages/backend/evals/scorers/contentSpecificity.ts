import { createScorer } from "evalite";
import { generateText, Output } from "ai";
import { z } from "zod";

import { getAI } from "../../src/providers/llm/models";

const ratingSchema = z.object({
  score: z
    .number()
    .min(0)
    .max(1)
    .describe("Specificity score from 0 (generic) to 1 (highly specific)"),
  rationale: z.string().describe("Brief explanation of the score"),
});

export const contentSpecificity = createScorer<any, any, any>({
  name: "Content Specificity",
  description: "LLM-as-judge: penalizes generic filler, rewards specific names, numbers, quotes",
  scorer: async ({ output }) => {
    if (!output.content) {
      return {
        score: 1,
        metadata: { rationale: "No content to evaluate (e.g. rejected connection)" },
      };
    }

    const { output: result } = await generateText({
      model: getAI().languageModel("evaluate"),
      output: Output.object({ schema: ratingSchema }),
      system: `You are a content quality evaluator. Rate how specific and concrete the given learning card content is on a 0-1 scale.

Score 0: Generic content that could apply to any topic. Uses vague phrases like "this chapter discusses important concepts", "there are many factors", "the author explains key ideas".
Score 0.5: Some specific details but padded with generic filler.
Score 1: Highly specific content with concrete facts, exact names, numbers, dates, verbatim quotes, or precise examples from the source.

Be strict. Most AI-generated content scores 0.3-0.6 due to vague hedging.`,
      prompt: `Rate the specificity of this learning card content:

Card content: "${output.content}"

Source material (for context):
${output.sourceChunks.slice(0, 2).join("\n---\n")}`,
      temperature: 0,
    });

    const rating = result ?? { score: 0, rationale: "No output from LLM" };

    return {
      score: rating.score,
      metadata: { rationale: rating.rationale },
    };
  },
});
