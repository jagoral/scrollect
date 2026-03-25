import { createScorer } from "evalite";
import { generateText, Output } from "ai";
import { z } from "zod";

import { getAI } from "../../../providers/ai";

const ratingSchema = z.object({
  score: z
    .number()
    .min(0)
    .max(1)
    .describe("Connection genuineness score from 0 (superficial) to 1 (meaningful)"),
  rationale: z.string().describe("Brief explanation"),
});

export const connectionGenuineness = createScorer<any, any, any>({
  name: "Connection Genuineness",
  description: "LLM-as-judge: evaluates whether the connection between two sections is meaningful",
  scorer: async ({ input, output }) => {
    if (!output.isGenuineConnection) {
      return {
        score: 0.5,
        metadata: { rationale: "Connection rejected by LLM (isGenuineConnection=false)" },
      };
    }

    const { output: result } = await generateText({
      model: getAI().languageModel("fast"),
      output: Output.object({ schema: ratingSchema }),
      system: `You are a connection quality evaluator for a learning app. Rate how meaningful and genuine the discovered connection between two document sections is.

Score 0: Superficial or forced connection. The sections merely share a common word or broad topic without real conceptual overlap.
Score 0.5: Moderate connection. There is some thematic overlap but the explanation is vague or doesn't reference specific evidence from both sources.
Score 1: Genuine, insightful connection. The card explains a specific conceptual link with evidence from both sections - shared patterns, complementary perspectives, or cause-and-effect relationships.`,
      prompt: `Section A: "${input.sectionATitle}"
Summary A: ${input.sectionASummary}

Section B: "${input.sectionBTitle}"
Summary B: ${input.sectionBSummary}

Connection card content: "${output.content}"
Source A hint: ${output.typeData.sourceATitleHint}
Source B hint: ${output.typeData.sourceBTitleHint}`,
      temperature: 0,
    });

    const rating = result ?? { score: 0, rationale: "No output from LLM" };

    return {
      score: rating.score,
      metadata: { rationale: rating.rationale },
    };
  },
});
