export interface DocumentTag {
  tagId: string;
  tagName: string;
  source: "ai" | "manual";
}

export function buildTagMap(
  tagsBatch: Record<string, { _id: string; name: string; source: "ai" | "manual" }[]> | undefined,
): Map<string, DocumentTag[]> {
  const map = new Map<string, DocumentTag[]>();
  if (!tagsBatch) return map;
  for (const [docId, raw] of Object.entries(tagsBatch)) {
    map.set(
      docId,
      raw.map((t) => ({ tagId: t._id, tagName: t.name, source: t.source })),
    );
  }
  return map;
}
