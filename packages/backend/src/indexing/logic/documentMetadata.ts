const MAX_TITLE_LENGTH = 160;
const TITLE_FALLBACK_FILE_TYPES = new Set(["pdf", "epub"]);

const GENERIC_TITLES = new Set([
  "untitled",
  "untitled document",
  "document",
  "document title",
  "unknown",
  "unknown title",
]);

export function shouldInferDocumentTitle(opts: { fileType: string; hasParsedTitle: boolean }) {
  return TITLE_FALLBACK_FILE_TYPES.has(opts.fileType) && !opts.hasParsedTitle;
}

export function cleanDocumentTitle(title: string | null | undefined): string | undefined {
  const normalized = title?.replace(/\s+/g, " ").trim();
  if (!normalized) return undefined;

  const withoutWrappingQuotes = normalized.replace(/^["']|["']$/g, "").trim();
  if (!withoutWrappingQuotes) return undefined;

  const lower = withoutWrappingQuotes.toLowerCase();
  if (GENERIC_TITLES.has(lower)) return undefined;

  return withoutWrappingQuotes.slice(0, MAX_TITLE_LENGTH);
}

export function firstChunkTitleContext(content: string): string {
  return content.trim().slice(0, 6_000);
}
