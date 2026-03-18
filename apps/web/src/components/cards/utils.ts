export function formatSourceLocation(
  title: string,
  sectionTitle?: string | null,
  pageNumber?: number | null,
): string {
  if (sectionTitle && pageNumber != null) return `${title} - ${sectionTitle}, p. ${pageNumber}`;
  if (sectionTitle) return `${title} - ${sectionTitle}`;
  if (pageNumber != null) return `${title}, p. ${pageNumber}`;
  return title;
}
