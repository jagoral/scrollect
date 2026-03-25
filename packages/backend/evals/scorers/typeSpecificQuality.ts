import { createScorer } from "evalite";
import { generateText, Output } from "ai";
import { z } from "zod";

import { getAI } from "../../convex/providers/ai";
import type { DraftCardType } from "../../convex/lib/validators";

const ratingSchema = z.object({
  score: z.number().min(0).max(1).describe("Quality score from 0 (poor) to 1 (excellent)"),
  rationale: z.string().describe("Brief explanation"),
});

function buildTypePrompt(cardType: DraftCardType): string {
  switch (cardType) {
    case "insight":
      return `Evaluate this INSIGHT card:
- Does it contain a specific fact or surprising detail (not a vague summary)?
- Is the insight grounded in the source material?
- Does it use bold formatting for key terms?
Score 0 for generic "this section discusses..." content. Score 1 for a concrete, memorable fact.`;

    case "quiz":
      return `Evaluate this QUIZ card:
- Is the question about a concrete, verifiable fact from the source?
- Are all options plausible and distinct (not obviously wrong)?
- Is the correct answer unambiguous?
- Does the explanation reference the source?
Score 0 if the question is vague or options are trivially distinguishable. Score 1 for a well-crafted quiz.`;

    case "quote":
      return `Evaluate this QUOTE card:
- Is the quotedText a verbatim passage from the source chunks? Check for exact substring match.
- Is the context (content field) helpful and concise?
- Is the quote notable, memorable, or thought-provoking?
Score 0 if the quote is fabricated or paraphrased. Score 1 for an exact, impactful quote.`;

    case "summary":
      return `Evaluate this SUMMARY card:
- Are the bullet points concrete and specific (names, numbers, concepts)?
- Does each bullet reference a distinct takeaway?
- Is the overview concise and informative?
Score 0 for abstract bullet points like "the author discusses key concepts". Score 1 for specific, useful takeaways.`;
  }
}

export const typeSpecificQuality = createScorer<any, any, any>({
  name: "Type-Specific Quality",
  description: "LLM-as-judge: evaluates card quality based on its specific type requirements",
  scorer: async ({ output }) => {
    const sourceContext = output.sourceChunks.slice(0, 2).join("\n---\n");
    const typeDataStr = JSON.stringify(output.typeData, null, 2);

    const { output: result } = await generateText({
      model: getAI().languageModel("fast"),
      output: Output.object({ schema: ratingSchema }),
      system: `You are a learning card quality evaluator. Be strict and specific in your assessment.`,
      prompt: `${buildTypePrompt(output.cardType)}

Card content: "${output.content}"
Type data: ${typeDataStr}

Source chunks:
${sourceContext}`,
      temperature: 0,
    });

    const rating = result ?? { score: 0, rationale: "No output from LLM" };

    return {
      score: rating.score,
      metadata: { rationale: rating.rationale, cardType: output.cardType },
    };
  },
});
