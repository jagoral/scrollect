import { createMockSummaryStore, createMockVectorStore } from "../../feed/logic/__tests__/mocks";
import type { VectorDeletionServices } from "../../providers/types";

export function createMockVectorDeletionServices(
  overrides?: Partial<VectorDeletionServices>,
): VectorDeletionServices {
  return {
    vectorStore: createMockVectorStore(),
    summaryStore: createMockSummaryStore(),
    ...overrides,
  };
}

// Re-export base mocks for convenience
export { createMockSummaryStore, createMockVectorStore } from "../../feed/logic/__tests__/mocks";
