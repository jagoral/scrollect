import { z } from "zod";

import type { ThematicLlm } from "./types";
import { type TokenUsage, generate } from "./ai";
import { buildLanguageInstruction, buildLearningGoalContext } from "./promptUtils";

const themeSchema = z.object({
  themes: z.array(
    z.object({
      title: z.string().min(3).max(100).describe("A concise theme title"),
      description: z.string().min(20).max(400).describe("A 1-3 sentence description of the theme"),
      relevantSections: z
        .array(z.string())
        .min(2)
        .describe("Section titles that contribute to this theme"),
    }),
  ),
});

function buildSystemPrompt(language?: string): string {
  return `You are a theme discovery assistant for Scrollect, a personal learning feed app.
Given section summaries from a document, identify cross-cutting themes that span multiple sections.

${buildLanguageInstruction(language)}

<rules>
- Each theme MUST involve at least 2 sections
- Discover 3-10 themes (fewer for shorter documents, more for longer ones)
- Theme titles must name a specific concept, pattern, or idea - not a generic category
- Descriptions must reference specific details from the relevant sections (names, facts, examples)
- relevantSections must contain EXACT section titles copied verbatim from the input - do not rephrase them
</rules>

<avoid>
- Generic theme titles: "Key Concepts", "Main Ideas", "Important Topics", "Core Themes"
- Vague descriptions: "This theme explores various aspects of the topic"
- Rewording section titles in relevantSections (must be exact matches)
</avoid>`;
}

export class AiSdkThematicLlm implements ThematicLlm {
  async discoverThemes(opts: {
    sectionSummaries: Array<{ sectionTitle: string; summary: string }>;
    documentTitle: string;
    language?: string;
    learningGoal?: string;
  }): Promise<{
    themes: Array<{ title: string; description: string; relevantSections: string[] }>;
    usage: TokenUsage;
  }> {
    const sectionText = opts.sectionSummaries
      .map((s) => `Section "${s.sectionTitle}":\n${s.summary}`)
      .join("\n\n---\n\n");

    const { output, usage } = await generate({
      model: "generate",
      schema: themeSchema,
      system: buildSystemPrompt(opts.language),
      prompt: `Document: "${opts.documentTitle}"${buildLearningGoalContext(opts.learningGoal)}\n\n${sectionText}`,
      temperature: 0.4,
    });

    return {
      themes: output?.themes ?? [],
      usage,
    };
  }
}
