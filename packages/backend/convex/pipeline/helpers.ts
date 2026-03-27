"use node";

import { createHash } from "crypto";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import type { WideEvent } from "../lib/logging";
import { captureEvent } from "../../src/providers/analytics";
import { getAI } from "../../src/providers/ai";
import { RunPodMarkerClient, StubMarkerClient } from "../../src/providers/marker";
import type { MarkerClient } from "../../src/providers/marker";
import { MarkdownNewArticleExtractor } from "../../src/providers/markdownNew";
import { AiSdkEmbeddings } from "../../src/providers/embeddings";
import { QdrantSummaryStore, QdrantVectorStore } from "../../src/providers/qdrant";
import { StubArticleExtractor, StubYouTubeExtractor } from "../../src/providers/stubs";
import type {
  ContentExtractor,
  EmbeddingProvider,
  SummaryVectorStore,
  VectorStore,
} from "../../src/providers/types";
import { DecodoYouTubeExtractor } from "../../src/providers/youtube";

export const CHUNK_STORE_BATCH_SIZE = 50;
export const EMBED_BATCH_SIZE = 100;
export const MAX_EMBED_RETRIES = 3;

export function createEmbeddingProvider(): EmbeddingProvider {
  return new AiSdkEmbeddings(getAI().embeddingModel("default"));
}

function getQdrantConfig(): { url: string; apiKey: string } {
  const url = process.env.QDRANT_URL;
  const apiKey = process.env.QDRANT_API_KEY;
  if (!url || !apiKey)
    throw new Error("QDRANT_URL and QDRANT_API_KEY environment variables are required");
  return { url, apiKey };
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

export function computeContentHash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

/** Convert a Convex document ID to a deterministic UUID for Qdrant. */
export function convexIdToUuid(id: string): string {
  const hex = createHash("sha256").update(id).digest("hex");
  // Format as UUID v4-shaped (set version nibble to 4, variant bits to 10xx)
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `${((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16)}${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join("-");
}

export async function storeMarkdownBlob(ctx: ActionCtx, markdown: string): Promise<Id<"_storage">> {
  const blob = new Blob([markdown], { type: "text/markdown" });
  return await ctx.storage.store(blob);
}

export async function fetchMarkdownBlob(
  ctx: ActionCtx,
  storageId: Id<"_storage">,
): Promise<string> {
  const url = await ctx.storage.getUrl(storageId);
  if (!url) throw new Error("Markdown blob not found in storage");
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch markdown blob: ${response.statusText}`);
  return await response.text();
}

export async function transitionToReady(opts: {
  ctx: ActionCtx;
  documentId: Id<"documents">;
  userId: string | undefined;
  evt: WideEvent;
}) {
  const { ctx, documentId, userId, evt } = opts;
  await ctx.runMutation(internal.documents.updateStatus, {
    id: documentId,
    status: "ready",
  });

  await ctx.scheduler.runAfter(0, internal.pipeline.tagging.autoSuggest, { documentId });
  await ctx.scheduler.runAfter(0, internal.pipeline.connectionDiscovery.discover, { documentId });

  if (userId) {
    await captureEvent({
      distinctId: userId,
      event: "pipeline.stage_completed",
      properties: {
        stage: "generating_cards",
        document_id: documentId,
      },
    });
  }

  evt.set("transitionedToReady", true);
}
