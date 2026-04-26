/**
 * Tiebreak policy for the document -> topic resolver (ADR-019).
 *
 * The schema permits multiple `documentTopics` rows per document so future multi-select
 * UI doesn't require a migration. v1 UI is single-select, so the resolver picks the
 * most-recent assignment by `createdAt` when several exist.
 *
 * The reduce iterates left-to-right and only swaps `best` when `current.createdAt`
 * is strictly greater. Equal timestamps keep the first occurrence (reduce stability),
 * which matches the convex query default ordering and gives a deterministic answer
 * even when the database returns rows in implementation-defined order.
 */
export type DocumentTopicAssignment = { topicId: string; createdAt: number };

export function pickActiveTopicForDocument(
  assignments: ReadonlyArray<DocumentTopicAssignment>,
): string | undefined {
  if (assignments.length === 0) return undefined;
  const best = assignments.reduce((acc, current) =>
    current.createdAt > acc.createdAt ? current : acc,
  );
  return best.topicId;
}
