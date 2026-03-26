"use node";

import { generateText, Output } from "ai";
import { z } from "zod";

import { getAI } from "../providers/ai";

const DEFAULT_LANGUAGE = "en";
const SAMPLE_SIZE = 1000;

const SUPPORTED_CODES = [
  "en",
  "pl",
  "es",
  "de",
  "fr",
  "it",
  "pt",
  "nl",
  "ru",
  "uk",
  "cs",
  "sk",
  "ro",
  "hu",
  "bg",
  "hr",
  "sr",
  "sl",
  "sv",
  "no",
  "da",
  "fi",
  "tr",
  "ar",
  "he",
  "ja",
  "zh",
  "ko",
  "hi",
  "bn",
  "th",
  "vi",
  "id",
  "ms",
  "el",
  "ka",
  "lt",
  "lv",
  "et",
  "is",
  "ca",
  "fa",
  "sq",
  "hy",
  "az",
  "bs",
  "be",
] as const;

const languageSchema = z.object({
  code: z.enum(SUPPORTED_CODES),
});

function buildSample(text: string): string {
  const start = text.slice(0, SAMPLE_SIZE);
  if (text.length <= SAMPLE_SIZE * 2) return start;
  const mid = text.slice(Math.floor(text.length / 2), Math.floor(text.length / 2) + SAMPLE_SIZE);
  return start + "\n\n" + mid;
}

export async function detectLanguage(text: string): Promise<string> {
  if (text.length < 50) {
    return DEFAULT_LANGUAGE;
  }

  const sample = buildSample(text);

  try {
    const { output } = await generateText({
      model: getAI().languageModel("classify"),
      output: Output.object({ schema: languageSchema }),
      system: `You are a language classifier. Given a text sample, identify its primary language. Return the ISO 639-1 two-letter code. If the text contains multiple languages, return the code for the dominant one.`,
      prompt: sample,
      temperature: 0,
      maxRetries: 2,
    });

    return output?.code ?? DEFAULT_LANGUAGE;
  } catch {
    return DEFAULT_LANGUAGE;
  }
}
