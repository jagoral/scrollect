"use node";

import { customList } from "country-codes-list";

const isoToName: Record<string, string> = customList(
  "officialLanguageCode",
  "{officialLanguageNameEn}",
);

const OVERRIDES: Record<string, string> = {
  zh: "Chinese",
};

export function languageName(code: string): string {
  return OVERRIDES[code] ?? isoToName[code] ?? code;
}

export function buildLanguageInstruction(isoCode?: string): string {
  if (isoCode) {
    const name = languageName(isoCode);
    return `You MUST write your ENTIRE response in ${name}. Do not mix languages.`;
  }
  return `Write in the same language as the source text. Do not mix languages.`;
}
