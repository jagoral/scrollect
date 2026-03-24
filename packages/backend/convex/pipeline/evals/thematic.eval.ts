import { evalite, createScorer } from "evalite";

import { AiSdkThematicLlm } from "../../providers/thematicLlm";
import { ALL_FIXTURES } from "./fixtures";
import { contentSpecificity } from "./scorers";
import { detectLanguage } from "./scorers/languageMatch";

type ThematicInput = {
  sectionSummaries: Array<{ sectionTitle: string; summary: string }>;
  documentTitle: string;
  sectionTitles: string[];
};

type ThematicOutput = {
  themes: Array<{
    title: string;
    description: string;
    relevantSections: string[];
  }>;
  content: string;
  sourceChunks: string[];
};

const llm = new AiSdkThematicLlm();

const thematicLanguageMatch = createScorer<unknown, ThematicOutput, unknown>({
  name: "Language Match (English)",
  description: "Thematic themes must always be in English regardless of source language",
  scorer: ({ output }) => {
    const allText = output.themes.map((t) => `${t.title} ${t.description}`).join(" ");
    if (allText.length < 10) return 0;
    const detected = detectLanguage(allText);
    return detected === "en" ? 1 : 0;
  },
});

const sectionCoverage = createScorer<ThematicInput, ThematicOutput, unknown>({
  name: "Section Coverage",
  description: "Checks that relevantSections reference actual section titles from the input",
  scorer: ({ input, output }) => {
    const validTitles = new Set(input.sectionTitles);
    let total = 0;
    let valid = 0;

    for (const theme of output.themes) {
      for (const section of theme.relevantSections) {
        total++;
        if (validTitles.has(section)) valid++;
      }
    }

    return total === 0 ? 0 : valid / total;
  },
});

const themeCount = createScorer<unknown, ThematicOutput, unknown>({
  name: "Theme Count",
  description: "Checks that the number of discovered themes is reasonable (2-10)",
  scorer: ({ output }) => {
    const count = output.themes.length;
    if (count < 2) return 0;
    if (count > 10) return 0.5;
    return 1;
  },
});

const thematicSpecificity = createScorer<any, ThematicOutput, any>({
  name: "Theme Specificity",
  description: "Adapts contentSpecificity to work with thematic output format",
  scorer: async ({ output }) => {
    const result = await contentSpecificity({
      input: undefined,
      output: {
        content: output.themes.map((t) => `${t.title}: ${t.description}`).join("\n\n"),
        sourceChunks: output.sourceChunks,
      },
      expected: undefined,
    });
    return result.score ?? 0;
  },
});

function buildThematicData(): ThematicInput[] {
  return ALL_FIXTURES.map((doc) => ({
    sectionSummaries: doc.sections.map((s) => ({
      sectionTitle: s.sectionTitle,
      summary: s.sectionSummary,
    })),
    documentTitle: doc.title,
    sectionTitles: doc.sections.map((s) => s.sectionTitle),
  }));
}

evalite("Thematic Discovery", {
  data: () => buildThematicData().map((d) => ({ input: d })),
  task: async (input) => {
    const { themes } = await llm.discoverThemes({
      sectionSummaries: input.sectionSummaries,
      documentTitle: input.documentTitle,
    });

    const allSummaryText = input.sectionSummaries
      .map((s) => `${s.sectionTitle}: ${s.summary}`)
      .join("\n");

    return {
      themes,
      content: themes.map((t) => `${t.title}: ${t.description}`).join("\n\n"),
      sourceChunks: [allSummaryText],
    } satisfies ThematicOutput;
  },
  scorers: [thematicLanguageMatch, sectionCoverage, themeCount, thematicSpecificity],
  trialCount: 3,
});
