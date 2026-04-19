import { z } from "zod";

import type { ConnectionDiscoveryLlm } from "../types";
import { type TokenUsage, ZERO_USAGE, generate } from "./models";
import { buildLanguageInstruction } from "./promptUtils";

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
    .nullable()
    .describe("The key idea from source A relevant to this connection"),
  sourceBKeyIdea: z
    .string()
    .nullable()
    .describe("The key idea from source B relevant to this connection"),
  isGenuineConnection: z
    .boolean()
    .describe(
      "true if the connection is meaningful and non-trivial, false if the sections are only superficially related",
    ),
});

function buildSystemPrompt(language?: string): string {
  return `You are a connection discovery assistant for Scrollect, a personal learning feed app.
Given two sections from the user's library (possibly from different documents), determine if they share a meaningful conceptual connection and generate a connection card.

<instructions>
1. ${buildLanguageInstruction(language)}
2. Identify the key specific concept or fact in Section A.
3. Identify the key specific concept or fact in Section B.
4. Determine if there is a genuine conceptual link between them.
5. If yes, explain the connection referencing at least one specific detail from each section.
</instructions>

<genuine_connection_criteria>
Set isGenuineConnection to true ONLY for:
- Shared concepts discussed from different angles (e.g., both sections discuss the spacing effect but in different contexts)
- Complementary perspectives on the same phenomenon (e.g., one section describes the problem, the other the solution)
- Cause-and-effect relationships across sections
- Specific pattern parallels (e.g., both describe a "10x improvement" or a similar structural pattern)
</genuine_connection_criteria>

<reject_as_superficial>
Set isGenuineConnection to false if:
- Both sections merely mention the same broad topic (e.g., both mention "software" or "learning")
- The connection requires stretching or over-interpreting the text
- You cannot cite a specific fact from each section that supports the connection
</reject_as_superficial>

<format>
- Content must explain the CONNECTION between the two ideas, not summarize each one separately
- sourceATitleHint and sourceBTitleHint should be concise labels (use section title if more specific than document title)
- Reference specific facts, names, numbers, or quotes from both sources
</format>`;
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
    language?: string;
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

    const { output, usage } = await generate({
      model: "reason",
      schema: connectionDraftSchema,
      system: buildSystemPrompt(opts.language),
      prompt,
      temperature: 0.3,
    });

    if (!output || !output.isGenuineConnection) {
      return { card: null, usage };
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
      usage,
    };
  }
}

export class StubConnectionDiscoveryLlm implements ConnectionDiscoveryLlm {
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
    language?: string;
  }): Promise<{
    card: { content: string; typeData: Record<string, unknown> } | null;
    usage: TokenUsage;
  }> {
    return {
      card: {
        content: `Connection between "${opts.sectionA.title}" and "${opts.sectionB.title}": these sections share a conceptual link.`,
        typeData: {
          type: "connection",
          sourceATitleHint: opts.documentATitle,
          sourceBTitleHint: opts.documentBTitle,
          sourceAKeyIdea: `Key idea from ${opts.sectionA.title}`,
          sourceBKeyIdea: `Key idea from ${opts.sectionB.title}`,
        },
      },
      usage: ZERO_USAGE,
    };
  }
}
