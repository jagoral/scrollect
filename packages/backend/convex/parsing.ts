"use node";

import { v } from "convex/values";

import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { chunkContent, chunkMarkdown } from "./chunking";

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

      const { PDFParse } = await import("pdf-parse");
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
