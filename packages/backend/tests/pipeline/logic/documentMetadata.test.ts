import { describe, expect, it } from "vitest";

import {
  cleanDocumentTitle,
  firstChunkTitleContext,
  shouldInferDocumentTitle,
} from "../../../src/pipeline/logic/documentMetadata";

describe("document metadata logic", () => {
  it("infers titles only for parser-backed document types without parsed titles", () => {
    expect(shouldInferDocumentTitle({ fileType: "pdf", hasParsedTitle: false })).toBe(true);
    expect(shouldInferDocumentTitle({ fileType: "epub", hasParsedTitle: false })).toBe(true);
    expect(shouldInferDocumentTitle({ fileType: "pdf", hasParsedTitle: true })).toBe(false);
    expect(shouldInferDocumentTitle({ fileType: "text", hasParsedTitle: false })).toBe(false);
  });

  it("normalizes useful titles and rejects generic titles", () => {
    expect(cleanDocumentTitle("  The Art of Effective Learning  ")).toBe(
      "The Art of Effective Learning",
    );
    expect(cleanDocumentTitle('"Deep Work"')).toBe("Deep Work");
    expect(cleanDocumentTitle("Untitled Document")).toBeUndefined();
    expect(cleanDocumentTitle("Document")).toBeUndefined();
    expect(cleanDocumentTitle("")).toBeUndefined();
  });

  it("caps the first chunk context sent to title inference", () => {
    const content = `  ${"a".repeat(7_000)}  `;
    expect(firstChunkTitleContext(content)).toHaveLength(6_000);
  });
});
