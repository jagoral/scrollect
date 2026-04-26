import type { TopicEmbeddingServiceContext } from "../../src/providers/types";
import { createEmbeddingProvider } from "../../src/providers/wiring";

export function createTopicEmbeddingServiceContext(): TopicEmbeddingServiceContext {
  return {
    embedder: createEmbeddingProvider(),
  };
}
