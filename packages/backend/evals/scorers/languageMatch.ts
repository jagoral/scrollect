import { createScorer } from "evalite";

export function detectLanguage(text: string): "pl" | "en" {
  const polishChars = /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/g;
  const matches = text.match(polishChars);
  if (!matches) return "en";
  const ratio = matches.length / text.length;
  return ratio > 0.005 ? "pl" : "en";
}

export const languageMatch = createScorer<any, any, any>({
  name: "Language Match",
  description: "Checks if post output language matches the expected source language",
  scorer: ({ input, output }) => {
    if (!output.content) {
      return {
        score: 1,
        metadata: { rationale: "No content to evaluate (e.g. rejected connection)" },
      };
    }
    const detected = detectLanguage(output.content);
    return detected === input.expectedLanguage ? 1 : 0;
  },
});
