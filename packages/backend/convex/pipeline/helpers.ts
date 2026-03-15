"use node";

import { createHash } from "crypto";

import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { getAI } from "../providers/ai";
import { MarkdownNewArticleExtractor } from "../providers/markdownNew";
import { AiSdkEmbeddings } from "../providers/embeddings";
import { QdrantSummaryStore, QdrantVectorStore } from "../providers/qdrant";
import { StubArticleExtractor, StubYouTubeExtractor } from "../providers/stubs";
import type {
  ContentExtractor,
  EmbeddingProvider,
  SummaryVectorStore,
  VectorStore,
} from "../providers/types";
import { YouTubeTranscriptExtractor } from "../providers/youtube";

export const CHUNK_STORE_BATCH_SIZE = 50;
export const EMBED_BATCH_SIZE = 100;
export const MAX_EMBED_RETRIES = 3;

export const INITIAL_POLL_DELAY_MS = 5_000;
export const MAX_POLL_DELAY_MS = 40_000;
export const MAX_POLL_DURATION_MS = 300_000;

export function getPollDelay(attempt: number): number {
  return Math.min(INITIAL_POLL_DELAY_MS * Math.pow(2, attempt), MAX_POLL_DELAY_MS);
}

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

export function createArticleExtractor(): ContentExtractor {
  if (process.env.USE_STUB_EXTRACTORS === "true") return new StubArticleExtractor();
  return new MarkdownNewArticleExtractor();
}

export function createYouTubeExtractor(): ContentExtractor {
  if (process.env.USE_STUB_EXTRACTORS === "true") return new StubYouTubeExtractor();
  const apifyApiToken = process.env.APIFY_API_TOKEN ?? undefined;
  return new YouTubeTranscriptExtractor({ apifyApiToken });
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
