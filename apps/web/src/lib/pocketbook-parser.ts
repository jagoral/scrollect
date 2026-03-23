export type ParsedHighlight = {
  externalId: string;
  text: string;
  note?: string;
  pageNumber?: number;
  sourceMetadata?: Record<string, string>;
};

export type ParseResult = {
  title: string;
  highlights: ParsedHighlight[];
  errors: string[];
};

const COLOR_NORMALIZATIONS: Record<string, string> = {
  cian: "cyan",
};

function extractColor(classAttr: string): string | undefined {
  const match = classAttr.match(/bm-color-(\w+)/);
  if (!match) return undefined;
  const raw = match[1];
  if (raw === "none") return undefined;
  return COLOR_NORMALIZATIONS[raw] ?? raw;
}

function parseBookmark(element: Element): {
  highlight?: ParsedHighlight;
  error?: string;
} {
  const externalId = element.getAttribute("id");
  if (!externalId) {
    return { error: "Bookmark missing id attribute" };
  }

  const textEl = element.querySelector(".bm-text");
  const text = textEl?.textContent?.trim() ?? "";
  if (!text) {
    return { error: `Bookmark ${externalId}: empty text` };
  }

  const noteEl = element.querySelector(".bm-note");
  const note = noteEl?.textContent?.trim() || undefined;

  const pageEl = element.querySelector(".bm-page");
  const pageText = pageEl?.textContent?.trim();
  const pageNumber = pageText ? Number(pageText) : undefined;

  const classAttr = element.getAttribute("class") ?? "";
  const color = extractColor(classAttr);

  const sourceMetadata: Record<string, string> = {};
  if (color) sourceMetadata.color = color;

  return {
    highlight: {
      externalId,
      text,
      note,
      pageNumber: pageNumber && !Number.isNaN(pageNumber) ? pageNumber : undefined,
      sourceMetadata: Object.keys(sourceMetadata).length > 0 ? sourceMetadata : undefined,
    },
  };
}

function parseHtmlDoc(html: string): Document {
  const parser = new DOMParser();
  return parser.parseFromString(html, "text/html");
}

function validateDoc(doc: Document): string | null {
  const meta = doc.querySelector('meta[name="generator"]');
  const content = meta?.getAttribute("content") ?? "";
  if (!content.includes("PocketBook Bookmarks Export")) {
    return "This file is not a Pocketbook bookmarks export. Please export notes from Pocketbook Cloud.";
  }
  return null;
}

export function validatePocketbookHtml(html: string): string | null {
  return validateDoc(parseHtmlDoc(html));
}

export function parsePocketbookHtml(html: string): ParseResult {
  const doc = parseHtmlDoc(html);

  const validationError = validateDoc(doc);
  if (validationError) {
    return { title: "", highlights: [], errors: [validationError] };
  }

  const title = doc.querySelector("title")?.textContent?.trim() ?? "";
  const bookmarks = doc.querySelectorAll(".bookmark");

  const highlights: ParsedHighlight[] = [];
  const errors: string[] = [];

  for (const bookmark of bookmarks) {
    const result = parseBookmark(bookmark);
    if (result.highlight) {
      highlights.push(result.highlight);
    }
    if (result.error) {
      errors.push(result.error);
    }
  }

  if (highlights.length === 0 && errors.length === 0) {
    errors.push("No highlights found in the file");
  }

  return { title, highlights, errors };
}
