import { AiSdkEmbeddings } from "./embeddings/voyage";
import { MarkdownNewArticleExtractor, StubArticleExtractor } from "./extractors/markdown";
import { RunPodMarkerClient, StubMarkerClient } from "./extractors/marker";
import type { MarkerClient } from "./extractors/marker";
import { DecodoYouTubeExtractor, StubYouTubeExtractor } from "./extractors/youtube";
import { getAI } from "./llm/models";
import { ExpoPushClient, StubPushClient } from "./push/expo";
import type {
  ContentExtractor,
  EmbeddingProvider,
  PushNotificationService,
  SummaryVectorStore,
  VectorStore,
} from "./types";
import { QdrantSummaryStore, QdrantVectorStore } from "./vectorStore/qdrant";

export function createEmbeddingProvider(): EmbeddingProvider {
  return new AiSdkEmbeddings(getAI().embeddingModel("embedding"));
}

export function createVectorStore(): VectorStore {
  const { url, apiKey } = getQdrantConfig();
  return new QdrantVectorStore(url, apiKey);
}

export function createSummaryVectorStore(): SummaryVectorStore {
  const { url, apiKey } = getQdrantConfig();
  return new QdrantSummaryStore(url, apiKey);
}

export function createMarkerClient(): MarkerClient {
  if (process.env.USE_STUB_EXTRACTORS === "true") return new StubMarkerClient();
  const endpointId = process.env.RUNPOD_ENDPOINT_ID;
  const apiKey = process.env.RUNPOD_API_KEY;
  if (!endpointId || !apiKey)
    throw new Error("RUNPOD_ENDPOINT_ID and RUNPOD_API_KEY environment variables are required");
  return new RunPodMarkerClient({ endpointId, apiKey });
}

export function createArticleExtractor(): ContentExtractor {
  if (process.env.USE_STUB_EXTRACTORS === "true") return new StubArticleExtractor();
  return new MarkdownNewArticleExtractor();
}

export function createYouTubeExtractor(): ContentExtractor {
  if (process.env.USE_STUB_EXTRACTORS === "true") return new StubYouTubeExtractor();
  const authKey = process.env.DECODO_AUTH_KEY;
  if (!authKey) throw new Error("DECODO_AUTH_KEY environment variable is not set");
  return new DecodoYouTubeExtractor({ authKey });
}

export function createPushNotificationService(): PushNotificationService {
  if (process.env.USE_STUB_PUSH === "true") return new StubPushClient();
  return new ExpoPushClient({ accessToken: process.env.EXPO_PUSH_ACCESS_TOKEN });
}

function getQdrantConfig(): { url: string; apiKey: string } {
  const url = process.env.QDRANT_URL;
  const apiKey = process.env.QDRANT_API_KEY;
  if (!url || !apiKey)
    throw new Error("QDRANT_URL and QDRANT_API_KEY environment variables are required");
  return { url, apiKey };
}
