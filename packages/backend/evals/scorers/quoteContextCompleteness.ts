import { createScorer } from "evalite";
import { generateText, Output } from "ai";
import { z } from "zod";

import { getAI } from "../../src/providers/llm/models";

const ratingSchema = z.object({
  score: z
    .number()
    .min(0)
    .max(1)
    .describe("Quote completeness score from 0 (missing attribution) to 1 (fully attributed)"),
  rationale: z.string().describe("Brief explanation of the score"),
});

export const quoteContextCompleteness = createScorer<any, any, any>({
  name: "Quote Context Completeness",
  description:
    "LLM-as-judge: checks that quote cards include speaker attribution with proper name and context about who/what the quote refers to",
  scorer: async ({ output }) => {
    if (output.cardType !== "quote") {
      return {
        score: 1,
        metadata: { rationale: "Not a quote card, skipping" },
      };
    }

    const attribution = output.typeData?.attribution;
    const content = output.content;
    const chunks = output.sourceChunks ?? [];

    if (!content && !attribution) {
      return {
        score: 0,
        metadata: { rationale: "Quote card has no content or attribution" },
      };
    }

    const { output: result } = await generateText({
      model: getAI().languageModel("evaluate"),
      output: Output.object({ schema: ratingSchema }),
      system: `You are a quote attribution evaluator. Check whether a quote card has complete attribution and context.

A fully attributed quote card must have:
1. WHO said it - the speaker's proper name (not "the author" or "a coach"), provided in the attribution field
2. Context in the content field explaining ABOUT WHOM or WHAT the quote is about
3. WHEN/WHERE context if available in the source (not required if the source doesn't provide it)

Scoring:
Score 0: No attribution or only vague attribution (e.g. "the author", "a player"). Content provides no context.
Score 0.3: Attribution is present but uses a title/role instead of a proper name, OR content lacks context about the subject of the quote.
Score 0.7: Proper name attribution is present and content provides some context, but missing key details available in the source.
Score 1: Full proper name attribution, content explains who/what the quote is about, and includes when/where if the source provides it.`,
      prompt: `Evaluate this quote card's attribution completeness:

Attribution field: "${attribution ?? "(missing)"}"
Card content: "${content}"
Quoted text: "${output.typeData?.quotedText ?? ""}"

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
