import { createScorer } from "evalite";
import { generateText, Output } from "ai";
import { z } from "zod";

import { getAI } from "../../src/providers/llm/models";
import type { DraftPostType } from "../../src/providers/types";

const ratingSchema = z.object({
  score: z
    .number()
    .min(0)
    .max(1)
    .describe("Substance score: 0 = worthless junk, 1 = genuinely substantive"),
  rationale: z.string().describe("Brief explanation"),
});

function buildSubstancePrompt(postType: DraftPostType): string {
  switch (postType) {
    case "quote":
      return `Is this quote an actual spoken or written passage from the source?
Score 0: Video/article title, heading, table-of-contents entry, metadata, sponsor read, call-to-action, or generic greeting/sign-off.
Score 0.5: A real passage but trivial or lacking substance (e.g. a single obvious statement).
Score 1: A substantive passage that conveys a real idea, argument, or observation from the source.`;

    case "insight":
      return `Does this insight contain a specific, verifiable fact or observation?
Score 0: Generic platitude, vague filler ("this section discusses..."), sponsor content, or content that could apply to any topic unchanged.
Score 0.5: References the topic but stays at a surface level without concrete details.
Score 1: States at least one specific claim with names, numbers, dates, or concrete details grounded in the source.`;

    case "summary":
      return `Does this summary present distinct, concrete takeaways?
Score 0: Bullet points merely restate the title, use abstract filler ("key concepts are discussed"), or all say the same thing differently.
Score 0.5: Some bullets reference specifics but others are vague filler.
Score 1: Each bullet point references a distinct, concrete detail with names, numbers, or specific concepts.`;

    case "quiz":
      return `Is this quiz answerable from the source with a specific factual answer?
Score 0: Trivially obvious ("Is X good?"), impossibly vague, tests opinion, or derived from sponsor content.
Score 0.5: Related to source content but the question is too broad or the answer is guessable without reading the source.
Score 1: Tests recall of a concrete, verifiable detail that requires having read the source material.`;
  }
}

export const substantiveContent = createScorer<any, any, any>({
  name: "Substantive Content",
  description:
    "LLM-as-judge: rejects semantically worthless posts that pass structural quality checks",
  scorer: async ({ output }) => {
    if (!output.content) {
      return {
        score: 1,
        metadata: { rationale: "No content to evaluate (e.g. rejected connection)" },
      };
    }

    const sourceContext = output.sourceChunks?.slice(0, 2).join("\n---\n") ?? "";
    const typeDataStr = JSON.stringify(output.typeData, null, 2);

    const { output: result } = await generateText({
      model: getAI().languageModel("evaluate"),
      output: Output.object({ schema: ratingSchema }),
      system: `You are a strict content quality gatekeeper for a personal learning feed.
Posts must have genuine substance to pass. Evaluate whether the post provides real learning value or is worthless filler.`,
      prompt: `${buildSubstancePrompt(output.postType)}

Post content: "${output.content}"
Type data: ${typeDataStr}

Source material:
${sourceContext}`,
      temperature: 0,
    });

    const rating = result ?? { score: 0, rationale: "No output from LLM" };
    return {
      score: rating.score,
      metadata: { rationale: rating.rationale, postType: output.postType },
    };
  },
});
