import { describe, expect, it } from "vitest";

import { buildLanguageInstruction, languageName } from "../promptUtils";

describe("languageName", () => {
  it("maps known ISO codes to English names", () => {
    expect(languageName("en")).toBe("English");
    expect(languageName("pl")).toBe("Polish");
    expect(languageName("de")).toBe("German");
    expect(languageName("ja")).toBe("Japanese");
  });

  it("returns 'Chinese' for zh via override", () => {
    expect(languageName("zh")).toBe("Chinese");
  });

  it("returns the raw code for unmapped codes", () => {
    expect(languageName("xx")).toBe("xx");
  });
});

describe("buildLanguageInstruction", () => {
  it("returns explicit instruction when language is provided", () => {
    const result = buildLanguageInstruction("pl");
    expect(result).toContain("Polish");
    expect(result).toContain("MUST");
  });

  it("returns fallback instruction when language is undefined", () => {
    const result = buildLanguageInstruction(undefined);
    expect(result).toContain("same language as the source text");
    expect(result).not.toContain("MUST");
  });
});
