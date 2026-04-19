/**
 * Sentinel assigned to chunks that have no section title during Indexing. Section
 * Summaries emitted with this title have no parent section heading; Feed serving
 * recognizes the value when reconstructing section attribution for Posts.
 */
export const UNGROUPED_SENTINEL = "(ungrouped)";
