"use node";

import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";

export const CHUNK_STORE_BATCH_SIZE = 50;
export const EMBED_BATCH_SIZE = 100;
export const MAX_EMBED_RETRIES = 3;

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
