export function formatSourceLocation(
  title: string,
  sectionTitle?: string | null,
  pageNumber?: number | null,
): string {
  if (sectionTitle) return `${title} · ${sectionTitle}`;
  if (pageNumber != null) return `${title} · Page ${pageNumber}`;
  return title;
}
