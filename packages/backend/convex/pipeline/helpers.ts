"use node";

import { createHash } from "crypto";

import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { OpenAIEmbeddings } from "../providers/openai";
import { QdrantVectorStore } from "../providers/qdrant";
import type { EmbeddingProvider, VectorStore } from "../providers/types";

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
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY environment variable is not set");
  return new OpenAIEmbeddings(apiKey);
}

export function createVectorStore(): VectorStore {
  const url = process.env.QDRANT_URL;
  const apiKey = process.env.QDRANT_API_KEY;
  if (!url || !apiKey)
    throw new Error("QDRANT_URL and QDRANT_API_KEY environment variables are required");
  return new QdrantVectorStore(url, apiKey);
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
