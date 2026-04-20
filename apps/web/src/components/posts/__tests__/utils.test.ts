import { describe, expect, it } from "vitest";

import { formatAttribution } from "../utils";

describe("formatAttribution", () => {
  it("returns title-only when no section is provided", () => {
    expect(formatAttribution({ title: "Clean Code", fileType: "pdf" })).toBe("From 'Clean Code'");
  });

  it("returns title-only when sectionTitle is null", () => {
    expect(formatAttribution({ title: "Clean Code", fileType: "pdf", sectionTitle: null })).toBe(
      "From 'Clean Code'",
    );
  });

  it("treats (ungrouped) sentinel as absent section", () => {
    expect(
      formatAttribution({
        title: "Clean Code",
        fileType: "pdf",
        sectionTitle: "(ungrouped)",
        pageStart: 10,
      }),
    ).toBe("From 'Clean Code'");
  });

  describe("PDF/EPUB", () => {
    it("shows section with page range for PDF", () => {
      expect(
        formatAttribution({
          title: "Clean Code",
          fileType: "pdf",
          sectionTitle: "Chapter 3: Functions",
          pageStart: 42,
          pageEnd: 58,
        }),
      ).toBe("From 'Clean Code' - Chapter 3: Functions, pages 42-58");
    });

    it("shows section with single page for EPUB", () => {
      expect(
        formatAttribution({
          title: "Clean Code",
          fileType: "epub",
          sectionTitle: "Chapter 3: Functions",
          pageStart: 42,
        }),
      ).toBe("From 'Clean Code' - Chapter 3: Functions, page 42");
    });

    it("shows single page when pageStart equals pageEnd", () => {
      expect(
        formatAttribution({
          title: "Clean Code",
          fileType: "pdf",
          sectionTitle: "Chapter 3: Functions",
          pageStart: 42,
          pageEnd: 42,
        }),
      ).toBe("From 'Clean Code' - Chapter 3: Functions, page 42");
    });

    it("shows section only when no page numbers are provided", () => {
      expect(
        formatAttribution({
          title: "Clean Code",
          fileType: "pdf",
          sectionTitle: "Chapter 3: Functions",
        }),
      ).toBe("From 'Clean Code' - Chapter 3: Functions");
    });
  });

  describe("YouTube", () => {
    it("renders timestamp from [MM:SS] pattern in section title", () => {
      expect(
        formatAttribution({
          title: "React Conf Keynote",
          fileType: "youtube",
          sectionTitle: "[14:32] Component Architecture",
        }),
      ).toBe("From 'React Conf Keynote' - at 14:32");
    });

    it("renders timestamp from [M:SS] pattern", () => {
      expect(
        formatAttribution({
          title: "React Conf Keynote",
          fileType: "youtube",
          sectionTitle: "[3:05] Intro",
        }),
      ).toBe("From 'React Conf Keynote' - at 3:05");
    });

    it("falls back to plain section when no timestamp pattern found", () => {
      expect(
        formatAttribution({
          title: "React Conf Keynote",
          fileType: "youtube",
          sectionTitle: "Introduction",
        }),
      ).toBe("From 'React Conf Keynote' - Introduction");
    });
  });

  describe("Markdown/Article", () => {
    it("shows section title for markdown", () => {
      expect(
        formatAttribution({
          title: "Architecture Guide",
          fileType: "markdown",
          sectionTitle: "API Design",
        }),
      ).toBe("From 'Architecture Guide' - API Design");
    });

    it("shows section title for article", () => {
      expect(
        formatAttribution({
          title: "Architecture Guide",
          fileType: "article",
          sectionTitle: "API Design",
        }),
      ).toBe("From 'Architecture Guide' - API Design");
    });
  });
});
