import { createScorer } from "evalite";
import { generateText, Output } from "ai";
import { z } from "zod";

import { getAI } from "../../src/providers/ai";

const ratingSchema = z.object({
  score: z
    .number()
    .min(0)
    .max(1)
    .describe("Reference clarity score from 0 (vague references) to 1 (all proper names used)"),
  rationale: z.string().describe("Brief explanation of the score"),
});

export const referenceClarity = createScorer<any, any, any>({
  name: "Reference Clarity",
  description:
    "LLM-as-judge: penalizes vague references like 'the player' or 'the author' when proper names are available in the source",
  scorer: async ({ output }) => {
    if (!output.content) {
      return {
        score: 1,
        metadata: {
          rationale: "No content to evaluate (follows suite convention for empty outputs)",
        },
      };
    }

    const chunks = output.sourceChunks ?? [];

    const { output: result } = await generateText({
      model: getAI().languageModel("evaluate"),
      output: Output.object({ schema: ratingSchema }),
      system: `You are a reference clarity evaluator. Check whether a learning card uses proper names instead of vague references.

Score 0: Card uses vague references like "the player", "the coach", "the author", "the expert", "a prominent figure" when the person's actual name is clearly available in the source material.
Score 0.5: Some proper names are used but there are still vague references where names were available.
Score 1: All people, teams, and organizations mentioned in the card are referred to by their proper names when those names appear in the source.

Important: Only penalize vague references when the proper name IS available in the source. If the source itself uses a vague reference without providing a name, the card is not expected to invent one.`,
      prompt: `Evaluate reference clarity in this learning card:

Card content: "${output.content}"
Type data: ${JSON.stringify(output.typeData, null, 2)}

Source material:
${chunks.slice(0, 3).join("\n---\n")}`,
      temperature: 0,
    });

    const rating = result ?? { score: 0, rationale: "No output from LLM" };

    return {
      score: rating.score,
      metadata: { rationale: rating.rationale },
    };
  },
});
