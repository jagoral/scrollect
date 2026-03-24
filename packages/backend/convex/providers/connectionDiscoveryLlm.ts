"use node";

import { generateText, Output } from "ai";
import { z } from "zod";

import type { ConnectionDiscoveryLlm, TokenUsage } from "./types";
import { getAI } from "./ai";

const connectionDraftSchema = z.object({
  content: z
    .string()
    .min(50)
    .max(800)
    .describe(
      "2-4 sentences explaining how these two sections connect. Use **bold** for key terms.",
    ),
  sourceATitleHint: z.string().describe("Short label for the first source (document or section)"),
  sourceBTitleHint: z.string().describe("Short label for the second source (document or section)"),
  sourceAKeyIdea: z
    .string()
    .optional()
    .describe("The key idea from source A relevant to this connection"),
  sourceBKeyIdea: z
    .string()
    .optional()
    .describe("The key idea from source B relevant to this connection"),
  isGenuineConnection: z
    .boolean()
    .describe(
      "true if the connection is meaningful and non-trivial, false if the sections are only superficially related",
    ),
});

function buildSystemPrompt(): string {
  return `You are a connection discovery assistant for Scrollect, a personal learning feed app.
Given two sections from the user's library (possibly from different documents), determine if they share a meaningful conceptual connection and generate a connection card.

RULES:
- Set isGenuineConnection to false if the sections are only superficially related (e.g. both mention "software" but discuss unrelated topics)
- Set isGenuineConnection to true only for meaningful connections: shared concepts, complementary perspectives, cause-and-effect relationships, or pattern parallels
- sourceATitleHint and sourceBTitleHint should be concise labels (document title or section title, whichever is more specific)
- Content should explain the CONNECTION between the two ideas, not just summarize each one
- Stay close to the source material - reference specific facts, concepts, or examples
- Write in the same language as the source chunks. If chunks are in Polish, write in Polish. If in English, write in English. Never translate.

Return a JSON object matching the schema.`;
}

function normalizeUsage(usage: {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}): TokenUsage {
  return {
    inputTokens: usage.inputTokens ?? 0,
    outputTokens: usage.outputTokens ?? 0,
    totalTokens: usage.totalTokens ?? 0,
  };
}

export class AiSdkConnectionDiscoveryLlm implements ConnectionDiscoveryLlm {
  async generateConnectionDraft(opts: {
    sectionA: {
      title: string;
      summary: string;
      chunks: Array<{ content: string; chunkId: string }>;
    };
    sectionB: {
      title: string;
      summary: string;
      chunks: Array<{ content: string; chunkId: string }>;
    };
    documentATitle: string;
    documentBTitle: string;
  }): Promise<{
    card: { content: string; typeData: Record<string, unknown> } | null;
    usage: TokenUsage;
  }> {
    const chunksA = opts.sectionA.chunks.map((c, i) => `Chunk A${i}:\n${c.content}`).join("\n\n");
    const chunksB = opts.sectionB.chunks.map((c, i) => `Chunk B${i}:\n${c.content}`).join("\n\n");

    const prompt = `Source A - Document: "${opts.documentATitle}", Section: "${opts.sectionA.title}"
Summary: ${opts.sectionA.summary}

Source chunks A:
${chunksA}

---

Source B - Document: "${opts.documentBTitle}", Section: "${opts.sectionB.title}"
Summary: ${opts.sectionB.summary}

Source chunks B:
${chunksB}`;

    const { output, usage } = await generateText({
      model: getAI().languageModel("fast"),
      output: Output.object({ schema: connectionDraftSchema }),
      system: buildSystemPrompt(),
      prompt,
      temperature: 0.3,
      maxRetries: 2,
    });

    const normalizedUsage = normalizeUsage(usage);

    if (!output || !output.isGenuineConnection) {
      return { card: null, usage: normalizedUsage };
    }

    return {
      card: {
        content: output.content,
        typeData: {
          type: "connection",
          sourceATitleHint: output.sourceATitleHint,
          sourceBTitleHint: output.sourceBTitleHint,
          ...(output.sourceAKeyIdea ? { sourceAKeyIdea: output.sourceAKeyIdea } : {}),
          ...(output.sourceBKeyIdea ? { sourceBKeyIdea: output.sourceBKeyIdea } : {}),
        },
      },
      usage: normalizedUsage,
    };
  }
}
