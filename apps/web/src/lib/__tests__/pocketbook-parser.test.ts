import { describe, expect, it } from "vitest";

import {
  parsePocketbookHtml,
  validatePocketbookHtml,
  type ParsedHighlight,
} from "../pocketbook-parser";

function pocketbookHtml({
  title = "Test Book",
  bookmarks = "",
}: { title?: string; bookmarks?: string } = {}) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en">
<head>
<meta name="generator" content="PocketBook Bookmarks Export"></meta>
<title>${title}</title>
<style></style>
</head>
<body>
${bookmarks}
</body>
</html>`;
}

function bookmark({
  id = "abc-123",
  color = "red",
  page = "42",
  text = "Some highlighted text",
  note = "",
}: {
  id?: string;
  color?: string;
  page?: string;
  text?: string;
  note?: string;
} = {}) {
  const noteHtml = note ? `<div class="bm-note"><p>${note}</p></div>` : "";
  return `<div id="${id}" class="bookmark bm-color-${color}">
  <p class="bm-page">${page}</p>
  <div class="bm-text"><p>${text}</p></div>
  ${noteHtml}
</div>`;
}

describe("validatePocketbookHtml", () => {
  it("returns null for valid Pocketbook HTML", () => {
    const html = pocketbookHtml();
    expect(validatePocketbookHtml(html)).toBeNull();
  });

  it("returns error for HTML without generator meta tag", () => {
    const html = `<html><head><title>Not Pocketbook</title></head><body></body></html>`;
    expect(validatePocketbookHtml(html)).toBe(
      "This file is not a Pocketbook bookmarks export. Please export notes from Pocketbook Cloud.",
    );
  });

  it("returns error for HTML with wrong generator value", () => {
    const html = `<html><head><meta name="generator" content="Kindle Export"></meta></head><body></body></html>`;
    expect(validatePocketbookHtml(html)).toBe(
      "This file is not a Pocketbook bookmarks export. Please export notes from Pocketbook Cloud.",
    );
  });

  it("returns error for empty string", () => {
    expect(validatePocketbookHtml("")).toBe(
      "This file is not a Pocketbook bookmarks export. Please export notes from Pocketbook Cloud.",
    );
  });
});

describe("parsePocketbookHtml", () => {
  describe("valid Pocketbook HTML", () => {
    it("parses a single bookmark with all fields", () => {
      const html = pocketbookHtml({
        title: "Deep Work",
        bookmarks: bookmark({
          id: "3dbc1212-9820-4919-8062-15543a8aa201",
          color: "red",
          page: "543",
          text: "Highlighted text here",
          note: "User note here",
        }),
      });

      const result = parsePocketbookHtml(html);

      expect(result.title).toBe("Deep Work");
      expect(result.highlights).toHaveLength(1);
      expect(result.errors).toHaveLength(0);

      const h = result.highlights[0];
      expect(h.externalId).toBe("3dbc1212-9820-4919-8062-15543a8aa201");
      expect(h.text).toBe("Highlighted text here");
      expect(h.note).toBe("User note here");
      expect(h.pageNumber).toBe(543);
      expect(h.sourceMetadata?.color).toBe("red");
    });

    it("parses multiple bookmarks", () => {
      const html = pocketbookHtml({
        bookmarks: [
          bookmark({ id: "id-1", text: "First highlight", page: "10" }),
          bookmark({ id: "id-2", text: "Second highlight", page: "20" }),
          bookmark({ id: "id-3", text: "Third highlight", page: "30" }),
        ].join("\n"),
      });

      const result = parsePocketbookHtml(html);

      expect(result.highlights).toHaveLength(3);
      expect(result.errors).toHaveLength(0);
      expect(result.highlights.map((h) => h.externalId)).toEqual(["id-1", "id-2", "id-3"]);
    });

    it("extracts book title from <title> element", () => {
      const html = pocketbookHtml({ title: "Atomic Habits" });
      const result = parsePocketbookHtml(html);
      expect(result.title).toBe("Atomic Habits");
    });

    it("returns empty title when <title> is absent", () => {
      const html = `<?xml version="1.0" encoding="UTF-8"?>
<html><head>
<meta name="generator" content="PocketBook Bookmarks Export"></meta>
</head><body>
${bookmark()}
</body></html>`;

      const result = parsePocketbookHtml(html);
      expect(result.title).toBe("");
    });
  });

  describe("optional fields", () => {
    it("handles bookmarks without notes", () => {
      const html = pocketbookHtml({
        bookmarks: bookmark({ id: "no-note", text: "Just a highlight" }),
      });

      const result = parsePocketbookHtml(html);
      expect(result.highlights[0].note).toBeUndefined();
    });

    it("handles bookmarks without page numbers", () => {
      const html = pocketbookHtml({
        bookmarks: `<div id="no-page" class="bookmark bm-color-blue">
          <div class="bm-text"><p>Text without page</p></div>
        </div>`,
      });

      const result = parsePocketbookHtml(html);
      expect(result.highlights[0].pageNumber).toBeUndefined();
    });

    it("handles empty page number text", () => {
      const html = pocketbookHtml({
        bookmarks: `<div id="empty-page" class="bookmark bm-color-blue">
          <p class="bm-page"></p>
          <div class="bm-text"><p>Some text</p></div>
        </div>`,
      });

      const result = parsePocketbookHtml(html);
      expect(result.highlights[0].pageNumber).toBeUndefined();
    });

    it("handles non-numeric page number gracefully", () => {
      const html = pocketbookHtml({
        bookmarks: `<div id="bad-page" class="bookmark bm-color-blue">
          <p class="bm-page">not-a-number</p>
          <div class="bm-text"><p>Some text</p></div>
        </div>`,
      });

      const result = parsePocketbookHtml(html);
      expect(result.highlights[0].pageNumber).toBeUndefined();
    });

    it("sets note to undefined when bm-note contains only whitespace", () => {
      const html = pocketbookHtml({
        bookmarks: `<div id="ws-note" class="bookmark bm-color-blue">
          <p class="bm-page">5</p>
          <div class="bm-text"><p>Highlighted text</p></div>
          <div class="bm-note"><p>   </p></div>
        </div>`,
      });

      const result = parsePocketbookHtml(html);
      expect(result.highlights[0].note).toBeUndefined();
    });
  });

  describe("color handling", () => {
    it.each([
      ["red", "red"],
      ["blue", "blue"],
      ["yellow", "yellow"],
      ["green", "green"],
      ["pink", "pink"],
    ])("preserves standard color %s as %s", (input, expected) => {
      const html = pocketbookHtml({
        bookmarks: bookmark({ color: input }),
      });

      const result = parsePocketbookHtml(html);
      expect(result.highlights[0].sourceMetadata?.color).toBe(expected);
    });

    it("normalizes 'cian' to 'cyan'", () => {
      const html = pocketbookHtml({
        bookmarks: bookmark({ color: "cian" }),
      });

      const result = parsePocketbookHtml(html);
      expect(result.highlights[0].sourceMetadata?.color).toBe("cyan");
    });

    it("returns undefined for color 'none'", () => {
      const html = pocketbookHtml({
        bookmarks: bookmark({ color: "none" }),
      });

      const result = parsePocketbookHtml(html);
      expect(result.highlights[0].sourceMetadata?.color).toBeUndefined();
    });

    it("returns undefined when no bm-color class is present", () => {
      const html = pocketbookHtml({
        bookmarks: `<div id="no-color" class="bookmark">
          <p class="bm-page">1</p>
          <div class="bm-text"><p>No color highlight</p></div>
        </div>`,
      });

      const result = parsePocketbookHtml(html);
      expect(result.highlights[0].sourceMetadata?.color).toBeUndefined();
    });
  });

  describe("error handling and edge cases", () => {
    it("rejects non-Pocketbook HTML and returns validation error", () => {
      const html = `<html><head><title>Wrong</title></head><body><div class="bookmark"><div class="bm-text"><p>text</p></div></div></body></html>`;

      const result = parsePocketbookHtml(html);

      expect(result.title).toBe("");
      expect(result.highlights).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("not a Pocketbook bookmarks export");
    });

    it("rejects empty string input", () => {
      const result = parsePocketbookHtml("");

      expect(result.title).toBe("");
      expect(result.highlights).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
    });

    it("reports error for bookmark missing id attribute", () => {
      const html = pocketbookHtml({
        bookmarks: `<div class="bookmark bm-color-red">
          <p class="bm-page">1</p>
          <div class="bm-text"><p>Missing ID</p></div>
        </div>`,
      });

      const result = parsePocketbookHtml(html);
      expect(result.highlights).toHaveLength(0);
      expect(result.errors).toContainEqual("Bookmark missing id attribute");
    });

    it("filters out bookmarks with empty text", () => {
      const html = pocketbookHtml({
        bookmarks: `<div id="empty-text" class="bookmark bm-color-red">
          <p class="bm-page">1</p>
          <div class="bm-text"><p></p></div>
        </div>`,
      });

      const result = parsePocketbookHtml(html);
      expect(result.highlights).toHaveLength(0);
      expect(result.errors).toContainEqual("Bookmark empty-text: empty text");
    });

    it("filters out bookmarks with whitespace-only text", () => {
      const html = pocketbookHtml({
        bookmarks: `<div id="ws-text" class="bookmark bm-color-red">
          <p class="bm-page">1</p>
          <div class="bm-text"><p>   </p></div>
        </div>`,
      });

      const result = parsePocketbookHtml(html);
      expect(result.highlights).toHaveLength(0);
      expect(result.errors).toContainEqual("Bookmark ws-text: empty text");
    });

    it("filters out bookmarks with missing bm-text element", () => {
      const html = pocketbookHtml({
        bookmarks: `<div id="no-text-el" class="bookmark bm-color-red">
          <p class="bm-page">1</p>
        </div>`,
      });

      const result = parsePocketbookHtml(html);
      expect(result.highlights).toHaveLength(0);
      expect(result.errors).toContainEqual("Bookmark no-text-el: empty text");
    });

    it("skips malformed bookmarks and continues parsing valid ones", () => {
      const html = pocketbookHtml({
        bookmarks: [
          // Valid
          bookmark({ id: "valid-1", text: "Good highlight" }),
          // Malformed: no id
          `<div class="bookmark bm-color-red">
            <div class="bm-text"><p>No ID</p></div>
          </div>`,
          // Malformed: empty text
          `<div id="empty" class="bookmark bm-color-red">
            <div class="bm-text"><p></p></div>
          </div>`,
          // Valid
          bookmark({ id: "valid-2", text: "Another good one" }),
        ].join("\n"),
      });

      const result = parsePocketbookHtml(html);

      expect(result.highlights).toHaveLength(2);
      expect(result.highlights[0].externalId).toBe("valid-1");
      expect(result.highlights[1].externalId).toBe("valid-2");
      expect(result.errors).toHaveLength(2);
    });

    it("returns 'No highlights found' error when file has no bookmark elements", () => {
      const html = pocketbookHtml({ bookmarks: "" });
      const result = parsePocketbookHtml(html);

      expect(result.highlights).toHaveLength(0);
      expect(result.errors).toEqual(["No highlights found in the file"]);
    });

    it("does not add 'No highlights found' when there are already errors", () => {
      // A file with only malformed bookmarks should report those errors,
      // not add the generic "No highlights found" message
      const html = pocketbookHtml({
        bookmarks: `<div class="bookmark bm-color-red">
          <div class="bm-text"><p>No ID bookmark</p></div>
        </div>`,
      });

      const result = parsePocketbookHtml(html);
      expect(result.highlights).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toBe("Bookmark missing id attribute");
    });
  });

  describe("multi-paragraph text", () => {
    it("concatenates text from multiple paragraphs in bm-text", () => {
      const html = pocketbookHtml({
        bookmarks: `<div id="multi-p" class="bookmark bm-color-yellow">
          <p class="bm-page">100</p>
          <div class="bm-text">
            <p>First paragraph.</p>
            <p>Second paragraph.</p>
          </div>
        </div>`,
      });

      const result = parsePocketbookHtml(html);
      expect(result.highlights[0].text).toContain("First paragraph.");
      expect(result.highlights[0].text).toContain("Second paragraph.");
    });
  });

  describe("return value shape", () => {
    it("returns correct count of highlights", () => {
      const html = pocketbookHtml({
        bookmarks: [
          bookmark({ id: "h1", text: "One" }),
          bookmark({ id: "h2", text: "Two" }),
          bookmark({ id: "h3", text: "Three" }),
          bookmark({ id: "h4", text: "Four" }),
          bookmark({ id: "h5", text: "Five" }),
        ].join("\n"),
      });

      const result = parsePocketbookHtml(html);
      expect(result.highlights).toHaveLength(5);
    });

    it("each highlight has the correct shape", () => {
      const html = pocketbookHtml({
        bookmarks: bookmark({
          id: "shape-test",
          color: "blue",
          page: "99",
          text: "Shape check",
          note: "A note",
        }),
      });

      const result = parsePocketbookHtml(html);
      const h: ParsedHighlight = result.highlights[0];

      expect(h).toEqual({
        externalId: "shape-test",
        text: "Shape check",
        note: "A note",
        pageNumber: 99,
        sourceMetadata: { color: "blue" },
      });
    });

    it("result always has title, highlights array, and errors array", () => {
      const result = parsePocketbookHtml(pocketbookHtml({ bookmarks: bookmark() }));

      expect(result).toHaveProperty("title");
      expect(result).toHaveProperty("highlights");
      expect(result).toHaveProperty("errors");
      expect(Array.isArray(result.highlights)).toBe(true);
      expect(Array.isArray(result.errors)).toBe(true);
    });
  });

  describe("realistic Pocketbook export", () => {
    it("parses a realistic multi-bookmark export", () => {
      const html = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en">
<head>
<meta name="generator" content="PocketBook Bookmarks Export"></meta>
<title>Thinking, Fast and Slow</title>
<style>body { font-family: serif; }</style>
</head>
<body>
<div id="3dbc1212-9820-4919-8062-15543a8aa201" class="bookmark bm-color-red">
<p class="bm-page">543</p>
<div class="bm-text"><p>Nothing in life is as important as you think it is, while you are thinking about it</p></div>
<div class="bm-note"><p>Focusing illusion</p></div>
</div>
<div id="CE9E95A5-5337-5267-80EB-D98DC346266B" class="bookmark bm-color-cian">
<p class="bm-page">100</p>
<div class="bm-text"><p>A reliable way to make people believe in falsehoods is frequent repetition</p></div>
</div>
<div id="A1B2C3D4-E5F6-7890-ABCD-EF1234567890" class="bookmark bm-color-yellow">
<p class="bm-page">250</p>
<div class="bm-text"><p>The confidence that individuals have in their beliefs depends mostly on the quality of the story they can tell about what they see</p></div>
<div class="bm-note"><p>WYSIATI - What You See Is All There Is</p></div>
</div>
</body>
</html>`;

      const result = parsePocketbookHtml(html);

      expect(result.title).toBe("Thinking, Fast and Slow");
      expect(result.highlights).toHaveLength(3);
      expect(result.errors).toHaveLength(0);

      // First bookmark: red, with note
      expect(result.highlights[0]).toEqual({
        externalId: "3dbc1212-9820-4919-8062-15543a8aa201",
        text: "Nothing in life is as important as you think it is, while you are thinking about it",
        note: "Focusing illusion",
        pageNumber: 543,
        sourceMetadata: { color: "red" },
      });

      // Second bookmark: cian -> cyan, no note
      expect(result.highlights[1].sourceMetadata?.color).toBe("cyan");
      expect(result.highlights[1].note).toBeUndefined();
      expect(result.highlights[1].pageNumber).toBe(100);

      // Third bookmark: yellow, with note
      expect(result.highlights[2].sourceMetadata?.color).toBe("yellow");
      expect(result.highlights[2].note).toBe("WYSIATI - What You See Is All There Is");
    });
  });
});
