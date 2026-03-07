import { PDFParse } from "pdf-parse";
import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction } from "./_generated/server";
import { chunkContent, chunkMarkdown } from "./parsing";

export const processDocument = internalAction({
  args: {
    documentId: v.id("documents"),
  },
  handler: async (ctx, args) => {
    const doc = await ctx.runQuery(internal.embeddings.getDocument, {
      id: args.documentId,
    });
    if (!doc) {
      throw new Error(`Document ${args.documentId} not found`);
    }

    // Step 1: Set status to "processing"
    await ctx.runMutation(internal.documents.updateStatus, {
      id: args.documentId,
      status: "processing",
    });

    let chunks: { content: string; tokenCount: number }[];

    try {
      // Step 2: Fetch file from storage
      const url = await ctx.storage.getUrl(doc.storageId);
      if (!url) {
        throw new Error("File not found in storage");
      }

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to download file: ${response.statusText}`);
      }

      // Step 3: Parse content based on file type
      if (doc.fileType === "pdf") {
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
        chunks = chunkContent(text);
      } else {
        const text = await response.text();
        if (!text.trim()) {
          throw new Error("File is empty");
        }
        chunks = chunkMarkdown(text);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error during parsing";
      await ctx.runMutation(internal.documents.updateStatus, {
        id: args.documentId,
        status: "error",
        errorMessage: message,
      });
      return;
    }

    // Step 4: Store chunks in DB
    let chunkIds: Id<"chunks">[];
    try {
      chunkIds = await ctx.runMutation(internal.chunks.createBatch, {
        documentId: args.documentId,
        chunks,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error storing chunks";
      await ctx.runMutation(internal.documents.updateStatus, {
        id: args.documentId,
        status: "error",
        errorMessage: message,
      });
      return;
    }

    // Step 5: Update chunk count after successful parsing
    await ctx.runMutation(internal.documents.updateStatus, {
      id: args.documentId,
      status: "processing",
      chunkCount: chunks.length,
    });

    // Step 6: Embed chunks in Qdrant
    try {
      await ctx.runAction(internal.embeddings.embedChunks, {
        chunkIds,
      });
    } catch (error) {
      // Partial failure: chunks are stored but embedding failed
      const message = error instanceof Error ? error.message : "Unknown error during embedding";
      await ctx.runMutation(internal.documents.updateStatus, {
        id: args.documentId,
        status: "error",
        errorMessage: message,
      });
      return;
    }

    // Step 7: Mark document as ready
    await ctx.runMutation(internal.documents.updateStatus, {
      id: args.documentId,
      status: "ready",
      chunkCount: chunks.length,
    });
  },
});
