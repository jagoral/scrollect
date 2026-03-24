import { createScorer } from "evalite";

function detectLanguage(text: string): "pl" | "en" {
  const polishChars = /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/g;
  const matches = text.match(polishChars);
  if (!matches) return "en";
  const ratio = matches.length / text.length;
  return ratio > 0.005 ? "pl" : "en";
}

export const languageMatch = createScorer<any, any, any>({
  name: "Language Match",
  description: "Checks if card output language matches the expected source language",
  scorer: ({ input, output }) => {
    const detected = detectLanguage(output.content);
    return detected === input.expectedLanguage ? 1 : 0;
  },
});

export { detectLanguage };
