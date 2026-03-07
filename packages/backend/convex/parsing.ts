"use node";

import { v } from "convex/values";

import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { chunkMarkdown } from "./chunking";

export const submitPdfToDatalab = internalAction({
  args: {
    documentId: v.id("documents"),
    fileUrl: v.string(),
  },
  handler: async (ctx, args) => {
    const apiKey = process.env.DATALAB_API_KEY;
    if (!apiKey) {
      throw new Error("DATALAB_API_KEY environment variable is not set");
    }

    const formData = new FormData();
    formData.append("file_url", args.fileUrl);
    formData.append("output_format", "markdown");
    formData.append("mode", "accurate");
    formData.append("disable_image_extraction", "true");

    const submitResponse = await fetch("https://www.datalab.to/api/v1/convert", {
      method: "POST",
      headers: { "X-API-Key": apiKey },
      body: formData,
    });

    if (!submitResponse.ok) {
      const errorText = await submitResponse.text();
      throw new Error(`Datalab API submission failed: ${submitResponse.status} ${errorText}`);
    }

    const { success, request_check_url } = await submitResponse.json();
    if (!success || !request_check_url) {
      throw new Error("Datalab API did not return a valid request_check_url");
    }

    await ctx.runMutation(internal.helpers.scheduleDatalabPoll, {
      documentId: args.documentId,
      checkUrl: request_check_url,
      attempt: 0,
      delayMs: 5000,
    });
  },
});

const MAX_POLL_ATTEMPTS = 60;
const POLL_INTERVAL_MS = 5000;
const CHUNK_BATCH_SIZE = 50;

export const pollDatalabResult = internalAction({
  args: {
    documentId: v.id("documents"),
    checkUrl: v.string(),
    attempt: v.number(),
  },
  handler: async (ctx, args) => {
    const apiKey = process.env.DATALAB_API_KEY;
    if (!apiKey) {
      throw new Error("DATALAB_API_KEY environment variable is not set");
    }

    const checkResponse = await fetch(args.checkUrl, {
      headers: { "X-API-Key": apiKey },
    });
    if (!checkResponse.ok) {
      throw new Error(`Datalab polling failed: ${checkResponse.status}`);
    }

    const result = await checkResponse.json();

    if (result.status === "complete") {
      if (!result.success) {
        await ctx.runMutation(internal.documents.updateStatus, {
          id: args.documentId,
          status: "error",
          errorMessage: `Datalab conversion failed: ${result.error ?? "Unknown error"}`,
        });
        return;
      }

      const markdown = result.markdown?.trim();
      if (!markdown) {
        await ctx.runMutation(internal.documents.updateStatus, {
          id: args.documentId,
          status: "error",
          errorMessage: "No text content could be extracted from the PDF",
        });
        return;
      }

      console.log(`[pollDatalabResult] Markdown length: ${markdown.length}`);

      // Chunk and store directly in this action
      const chunks = chunkMarkdown(markdown);
      console.log(`[pollDatalabResult] ${chunks.length} chunks`);

      // Store chunks in batches to avoid mutation size limits
      const allChunkIds = [];
      for (let i = 0; i < chunks.length; i += CHUNK_BATCH_SIZE) {
        const batch = chunks.slice(i, i + CHUNK_BATCH_SIZE);
        const ids = await ctx.runMutation(internal.chunks.createBatch, {
          documentId: args.documentId,
          chunks: batch,
        });
        allChunkIds.push(...ids);
      }

      await ctx.runMutation(internal.documents.updateStatus, {
        id: args.documentId,
        status: "processing",
        chunkCount: chunks.length,
      });

      // Schedule embedding as a separate top-level action
      await ctx.runMutation(internal.helpers.scheduleEmbedChunks, {
        documentId: args.documentId,
        chunkIds: allChunkIds,
        chunkCount: chunks.length,
      });
      return;
    }

    // Still processing — schedule next poll
    if (args.attempt >= MAX_POLL_ATTEMPTS) {
      await ctx.runMutation(internal.documents.updateStatus, {
        id: args.documentId,
        status: "error",
        errorMessage: "Datalab API timed out after 5 minutes",
      });
      return;
    }

    await ctx.runMutation(internal.helpers.scheduleDatalabPoll, {
      documentId: args.documentId,
      checkUrl: args.checkUrl,
      attempt: args.attempt + 1,
      delayMs: POLL_INTERVAL_MS,
    });
  },
});

export const embedAndFinalize = internalAction({
  args: {
    documentId: v.id("documents"),
    chunkIds: v.array(v.id("chunks")),
    chunkCount: v.number(),
  },
  handler: async (ctx, args) => {
    try {
      await ctx.runAction(internal.embeddings.embedChunks, {
        chunkIds: args.chunkIds,
      });

      await ctx.runMutation(internal.documents.updateStatus, {
        id: args.documentId,
        status: "ready",
        chunkCount: args.chunkCount,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error during embedding";
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
