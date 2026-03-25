import { shuffle } from "es-toolkit";

import { buildLanguageInstruction } from "../../providers/promptUtils";
import type { HighlightLike } from "./generateFeed";

export function buildSystemPrompt(opts: {
  chunkCount: number;
  cardCount: number;
  language?: string;
}): string {
  const { chunkCount, cardCount, language } = opts;
  const languageRule = buildLanguageInstruction(language);

  return `You are an AI learning assistant for Scrollect, a personal learning feed app.
Your job is to surface specific, memorable fragments from documents as bite-sized learning cards.

CONTENT PHILOSOPHY: Stay close to the source. Prefer exact wordings, specific facts, surprising details, and concrete examples over generic summaries or interpretations. The user wants to re-encounter the actual content they saved - not a paraphrased version. When user highlights are provided, prioritize building cards directly from those highlighted passages.

Card types you MUST produce (aim for variety - use at least 3 different types):

1. **insight** - A specific fact, surprising detail, or concrete example from the source (2-4 sentences). Use **bold** for key terms. Prefer verbatim phrases and exact numbers/names from the text over generalizations.
2. **quiz** - A question testing recall of specific details from the source. Include:
   - variant: "multiple_choice" or "true_false"
   - question: the question text (ask about concrete facts, names, numbers - not vague concepts)
   - options: array of 4 choices (or 2 for true_false: ["True", "False"])
   - correctIndex: 0-based index of the correct option
   - explanation: brief explanation referencing the exact source detail
3. **quote** - A notable, memorable, or thought-provoking passage from the source. Include:
   - quotedText: the exact quoted text (copy verbatim, do not paraphrase)
   - attribution: (optional) author or source name
4. **summary** - Bullet points listing specific takeaways from MULTIPLE chunks. Include:
   - bulletPoints: array of 2-5 bullet point strings (each should reference a concrete detail, not abstract generalizations)
   - IMPORTANT: summaries MUST reference at least 2 different chunks via sourceChunkIndices
5. **connection** - Links specific ideas across different sources. Include:
   - sourceATitleHint: title/topic of the first source
   - sourceBTitleHint: title/topic of the second source
   - sourceAKeyIdea: one sentence with the specific idea from the first source
   - sourceBKeyIdea: one sentence with the specific idea from the second source
   - IMPORTANT: connections MUST reference at least 2 chunks via sourceChunkIndices
   - QUALITY GATE: Only create a connection if the relationship is genuinely insightful and non-obvious. If two chunks merely discuss the same topic without a deeper conceptual bridge, do NOT create a connection card - use a different type instead.

For ALL cards:
- content: 2-4 sentences that stay faithful to the source text (the main card body)
- sourceChunkIndices: array of 0-based indices into the provided chunks that this card draws from

LANGUAGE RULE: ${languageRule} Quote text (quotedText) must be kept verbatim from the source.

Return a JSON object: { "cards": [ { type, content, sourceChunkIndices, ...type-specific fields } ] }

Produce exactly ${cardCount} cards from the ${chunkCount} chunks provided. Ensure variety in types.`;
}

export function buildHighlightContext(
  highlights: HighlightLike[],
  selectedDocIds: Set<string>,
): string {
  const relevant = highlights.filter((h) => selectedDocIds.has(h.documentId));
  if (relevant.length === 0) return "";

  const sampled = shuffle(relevant).slice(0, 20);
  const lines = sampled.map((h) => {
    const base = `- "${h.text}"`;
    return h.note ? `${base} (user note: ${h.note})` : base;
  });

  return (
    "\n\nUSER HIGHLIGHTS (the user specifically highlighted these passages - they found them important. " +
    "Prioritize generating cards related to or building upon these highlighted concepts):\n" +
    lines.join("\n") +
    "\n\n"
  );
}

/** Returns the dominant language across chunks. Ties go to the first language seen. */
export function resolveLanguage(
  chunks: Array<{ documentId: string }>,
  docLanguageMap: Map<string, string | undefined>,
): string | undefined {
  const counts = new Map<string, number>();
  for (const chunk of chunks) {
    const lang = docLanguageMap.get(chunk.documentId);
    if (lang) counts.set(lang, (counts.get(lang) ?? 0) + 1);
  }
  if (counts.size === 0) return undefined;
  let dominant: string | undefined;
  let max = 0;
  for (const [lang, count] of counts) {
    if (count > max) {
      max = count;
      dominant = lang;
    }
  }
  return dominant;
}
