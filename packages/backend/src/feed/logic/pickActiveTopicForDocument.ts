/**
 * Tiebreak policy for the document -> topic resolver (ADR-019).
 *
 * The schema permits multiple `documentTopics` rows per document so future multi-select
 * UI doesn't require a migration. v1 UI is single-select, so the resolver picks the
 * most-recent assignment by `createdAt` when several exist.
 *
 * Tie-break: when multiple assignments share the same `createdAt`, the higher
 * `topicId` wins (lexicographic on the Convex id string). This makes the result
 * deterministic regardless of the order Convex returns rows in - a property the
 * caller actually relies on to avoid flapping the active topic across re-reads.
 */
export type DocumentTopicAssignment = { topicId: string; createdAt: number };

export function pickActiveTopicForDocument(
  assignments: ReadonlyArray<DocumentTopicAssignment>,
): string | undefined {
  if (assignments.length === 0) return undefined;
  return assignments.reduce((acc, current) => {
    if (current.createdAt > acc.createdAt) return current;
    if (current.createdAt < acc.createdAt) return acc;
    return current.topicId > acc.topicId ? current : acc;
  }).topicId;
}
