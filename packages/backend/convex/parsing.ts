import { v } from "convex/values";
import { PDFParse } from "pdf-parse";

import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";

const TARGET_CHUNK_SIZE = 750;
const CHUNK_OVERLAP = 50;
const MIN_CHUNK_SIZE = 100;

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function chunkContent(text: string): { content: string; tokenCount: number }[] {
  const chunks: { content: string; tokenCount: number }[] = [];
  if (!text.trim()) return chunks;

  const totalTokens = estimateTokens(text);
  if (totalTokens <= TARGET_CHUNK_SIZE + MIN_CHUNK_SIZE) {
    return [{ content: text.trim(), tokenCount: estimateTokens(text.trim()) }];
  }

  const charChunkSize = TARGET_CHUNK_SIZE * 4;
  const charOverlap = CHUNK_OVERLAP * 4;
  let start = 0;

  while (start < text.length) {
    let end = Math.min(start + charChunkSize, text.length);

    if (end < text.length) {
      const searchStart = Math.max(end - 200, start);
      const segment = text.slice(searchStart, end + 200);

      const breakPoints = ["\n\n", "\n", ". ", "? ", "! ", "; ", ", ", " "];
      let bestBreak = -1;

      for (const bp of breakPoints) {
        const idx = segment.lastIndexOf(bp, end - searchStart);
        if (idx !== -1) {
          bestBreak = searchStart + idx + bp.length;
          break;
        }
      }

      if (bestBreak > start) {
        end = bestBreak;
      }
    }

    const chunkText = text.slice(start, end).trim();
    if (chunkText.length > 0) {
      chunks.push({ content: chunkText, tokenCount: estimateTokens(chunkText) });
    }

    start = end - charOverlap;
    if (start >= text.length) break;
  }

  return chunks;
}

export function chunkMarkdown(text: string): { content: string; tokenCount: number }[] {
  const headingPattern = /\n(?=#{1,3} )/;
  const sections = text.split(headingPattern).filter((s) => s.trim());

  const chunks: { content: string; tokenCount: number }[] = [];

  for (const section of sections) {
    const tokens = estimateTokens(section);
    if (tokens <= TARGET_CHUNK_SIZE + MIN_CHUNK_SIZE) {
      const trimmed = section.trim();
      if (trimmed) {
        chunks.push({ content: trimmed, tokenCount: estimateTokens(trimmed) });
      }
    } else {
      chunks.push(...chunkContent(section));
    }
  }

  return chunks;
}

export const parsePdf = internalAction({
  args: {
    documentId: v.id("documents"),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.documents.updateStatus, {
      id: args.documentId,
      status: "processing",
    });

    try {
      const url = await ctx.storage.getUrl(args.storageId);
      if (!url) {
        throw new Error("File not found in storage");
      }

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to download file: ${response.statusText}`);
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length === 0) {
        throw new Error("File is empty");
      }

      const parser = new PDFParse({ data: new Uint8Array(buffer) });
      const result = await parser.getText();
      await parser.destroy();
      const text = result.text?.trim();
      if (!text) {
        throw new Error("No text content could be extracted from the PDF");
      }

      const chunks = chunkContent(text);

      await ctx.runMutation(internal.chunks.createBatch, {
        documentId: args.documentId,
        chunks,
      });

      await ctx.runMutation(internal.documents.updateStatus, {
        id: args.documentId,
        status: "ready",
        chunkCount: chunks.length,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error during PDF parsing";
      await ctx.runMutation(internal.documents.updateStatus, {
        id: args.documentId,
        status: "error",
        errorMessage: message,
      });
    }
  },
});

export const parseMarkdown = internalAction({
  args: {
    documentId: v.id("documents"),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.documents.updateStatus, {
      id: args.documentId,
      status: "processing",
    });

    try {
      const url = await ctx.storage.getUrl(args.storageId);
      if (!url) {
        throw new Error("File not found in storage");
      }

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to download file: ${response.statusText}`);
      }

      const text = await response.text();
      if (!text.trim()) {
        throw new Error("File is empty");
      }

      const chunks = chunkMarkdown(text);

      await ctx.runMutation(internal.chunks.createBatch, {
        documentId: args.documentId,
        chunks,
      });

      await ctx.runMutation(internal.documents.updateStatus, {
        id: args.documentId,
        status: "ready",
        chunkCount: chunks.length,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error during Markdown parsing";
      await ctx.runMutation(internal.documents.updateStatus, {
        id: args.documentId,
        status: "error",
        errorMessage: message,
      });
    }
  },
});
