const TIMESTAMP_PATTERN = /\[(\d{1,2}:\d{2})\]/;

interface FormatAttributionParams {
  title: string;
  fileType?: string;
  sectionTitle?: string | null;
  pageStart?: number | null;
  pageEnd?: number | null;
}

export function formatAttribution({
  title,
  fileType,
  sectionTitle,
  pageStart,
  pageEnd,
}: FormatAttributionParams): string {
  const cleanSection = normalizeSection(sectionTitle);
  const prefix = `From '${title}'`;

  if (!cleanSection) {
    return prefix;
  }

  if (fileType === "youtube") {
    const match = TIMESTAMP_PATTERN.exec(cleanSection);
    if (match) {
      return `${prefix} - at ${match[1]}`;
    }
  }

  if ((fileType === "pdf" || fileType === "epub") && pageStart != null) {
    const pageRange =
      pageEnd != null && pageEnd !== pageStart
        ? `pages ${pageStart}-${pageEnd}`
        : `page ${pageStart}`;
    return `${prefix} - ${cleanSection}, ${pageRange}`;
  }

  return `${prefix} - ${cleanSection}`;
}

function normalizeSection(sectionTitle?: string | null): string | null {
  if (!sectionTitle) return null;
  if (sectionTitle === "(ungrouped)") return null;
  return sectionTitle;
}
