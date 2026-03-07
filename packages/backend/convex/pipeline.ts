"use node";

import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";
import { internalAction } from "./_generated/server";
import { chunkMarkdown } from "./chunking";
import { DatalabParser } from "./providers/datalab";
import { OpenAIEmbeddings } from "./providers/openai";
import { QdrantVectorStore } from "./providers/qdrant";
import type { EmbeddingProvider, VectorStore } from "./providers/types";

const CHUNK_STORE_BATCH_SIZE = 50;
const EMBED_BATCH_SIZE = 100;
const MAX_EMBED_RETRIES = 3;

const INITIAL_POLL_DELAY_MS = 5_000;
const MAX_POLL_DELAY_MS = 40_000;
const MAX_POLL_DURATION_MS = 300_000;

function getPollDelay(attempt: number): number {
  return Math.min(INITIAL_POLL_DELAY_MS * Math.pow(2, attempt), MAX_POLL_DELAY_MS);
}

function createEmbeddingProvider(): EmbeddingProvider {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY environment variable is not set");
  return new OpenAIEmbeddings(apiKey);
}

function createVectorStore(): VectorStore {
  const url = process.env.QDRANT_URL;
  const apiKey = process.env.QDRANT_API_KEY;
  if (!url || !apiKey)
    throw new Error("QDRANT_URL and QDRANT_API_KEY environment variables are required");
  return new QdrantVectorStore(url, apiKey);
}

// --- Entry Point ---

export const startProcessing = internalAction({
  args: { documentId: v.id("documents") },
  handler: async (ctx, { documentId }) => {
    const doc = await ctx.runQuery(internal.documents.getInternal, { id: documentId });
    if (!doc) throw new Error(`Document ${documentId} not found`);

    if (doc.fileType === "pdf") {
      await ctx.runMutation(internal.documents.updateStatus, {
        id: documentId,
        status: "parsing",
      });
      await submitPdfParsingImpl(ctx, documentId, doc.storageId);
    } else {
      await ctx.runMutation(internal.documents.updateStatus, {
        id: documentId,
        status: "parsing",
      });
      await fetchAndParseMarkdownImpl(ctx, documentId, doc.storageId);
    }
  },
});

// --- PDF Parsing ---

async function submitPdfParsingImpl(
  ctx: ActionCtx,
  documentId: Id<"documents">,
  storageId: Id<"_storage">,
) {
  try {
    const apiKey = process.env.DATALAB_API_KEY;
    if (!apiKey) throw new Error("DATALAB_API_KEY environment variable is not set");

    const fileUrl = await ctx.storage.getUrl(storageId);
    if (!fileUrl) throw new Error("File not found in storage");

    const parser = new DatalabParser(apiKey);
    const checkUrl = await parser.submit(fileUrl);

    // Persist checkpoint BEFORE polling starts
    await ctx.runMutation(internal.documents.setDatalabCheckUrl, {
      id: documentId,
      checkUrl,
    });

    const startedAt = Date.now();
    await ctx.scheduler.runAfter(INITIAL_POLL_DELAY_MS, internal.pipeline.pollDatalabResult, {
      documentId,
      checkUrl,
      attempt: 0,
      startedAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "PDF submission failed";
    await ctx.runMutation(internal.documents.updateStatus, {
      id: documentId,
      status: "error",
      errorMessage: message,
      failedAt: "parsing",
    });
  }
}

export const pollDatalabResult = internalAction({
  args: {
    documentId: v.id("documents"),
    checkUrl: v.string(),
    attempt: v.number(),
    startedAt: v.number(),
  },
  handler: async (ctx, { documentId, checkUrl, attempt, startedAt }) => {
    const elapsed = Date.now() - startedAt;
    if (elapsed > MAX_POLL_DURATION_MS) {
      await ctx.runMutation(internal.documents.updateStatus, {
        id: documentId,
        status: "error",
        errorMessage: "PDF parsing timed out after 5 minutes",
        failedAt: "parsing",
      });
      return;
    }

    try {
      const apiKey = process.env.DATALAB_API_KEY;
      if (!apiKey) throw new Error("DATALAB_API_KEY environment variable is not set");

      const parser = new DatalabParser(apiKey);
      const result = await parser.poll(checkUrl);

      if (result.status === "complete") {
        await ctx.scheduler.runAfter(0, internal.pipeline.chunkAndStore, {
          documentId,
          markdown: result.markdown!,
        });
        return;
      }

      if (result.status === "error") {
        await ctx.runMutation(internal.documents.updateStatus, {
          id: documentId,
          status: "error",
          errorMessage: result.errorMessage ?? "PDF parsing failed",
          failedAt: "parsing",
        });
        return;
      }

      // Still pending — schedule next poll with exponential backoff
      const nextDelay = getPollDelay(attempt);
      await ctx.scheduler.runAfter(nextDelay, internal.pipeline.pollDatalabResult, {
        documentId,
        checkUrl,
        attempt: attempt + 1,
        startedAt,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Polling failed";
      await ctx.runMutation(internal.documents.updateStatus, {
        id: documentId,
        status: "error",
        errorMessage: message,
        failedAt: "parsing",
      });
    }
  },
});

// --- Markdown Parsing ---

async function fetchAndParseMarkdownImpl(
  ctx: ActionCtx,
  documentId: Id<"documents">,
  storageId: Id<"_storage">,
) {
  try {
    const url = await ctx.storage.getUrl(storageId);
    if (!url) throw new Error("File not found in storage");

    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to download file: ${response.statusText}`);

    const text = await response.text();
    if (!text.trim()) throw new Error("File is empty");

    await ctx.scheduler.runAfter(0, internal.pipeline.chunkAndStore, {
      documentId,
      markdown: text,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Markdown parsing failed";
    await ctx.runMutation(internal.documents.updateStatus, {
      id: documentId,
      status: "error",
      errorMessage: message,
      failedAt: "parsing",
    });
  }
}

// --- Chunking ---

export const chunkAndStore = internalAction({
  args: {
    documentId: v.id("documents"),
    markdown: v.string(),
  },
  handler: async (ctx, { documentId, markdown }) => {
    try {
      await ctx.runMutation(internal.documents.updateStatus, {
        id: documentId,
        status: "chunking",
      });

      const rawChunks = chunkMarkdown(markdown);
      const chunks = rawChunks.map((c, i) => ({
        content: c.content,
        chunkIndex: i,
        tokenCount: c.tokenCount,
      }));

      console.log(`[chunkAndStore] ${chunks.length} chunks for document ${documentId}`);

      const allChunkIds: Id<"chunks">[] = [];
      for (let i = 0; i < chunks.length; i += CHUNK_STORE_BATCH_SIZE) {
        const batch = chunks.slice(i, i + CHUNK_STORE_BATCH_SIZE);
        const ids = await ctx.runMutation(internal.chunks.createBatch, {
          documentId,
          chunks: batch,
        });
        allChunkIds.push(...ids);
      }

      await ctx.runMutation(internal.documents.updateStatus, {
        id: documentId,
        status: "embedding",
        chunkCount: chunks.length,
      });

      // Fan-out embedding batches
      await fanOutEmbedding(ctx, documentId, allChunkIds);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Chunking failed";
      await ctx.runMutation(internal.documents.updateStatus, {
        id: documentId,
        status: "error",
        errorMessage: message,
        failedAt: "chunking",
      });
    }
  },
});

// --- Embedding ---

async function fanOutEmbedding(
  ctx: ActionCtx,
  documentId: Id<"documents">,
  chunkIds: Id<"chunks">[],
) {
  if (chunkIds.length === 0) {
    await ctx.runMutation(internal.documents.updateStatus, {
      id: documentId,
      status: "ready",
      chunkCount: 0,
    });
    return;
  }

  const totalBatches = Math.ceil(chunkIds.length / EMBED_BATCH_SIZE);
  const jobId = await ctx.runMutation(internal.processingJobs.create, {
    documentId,
    totalBatches,
  });

  for (let i = 0; i < chunkIds.length; i += EMBED_BATCH_SIZE) {
    const batchChunkIds = chunkIds.slice(i, i + EMBED_BATCH_SIZE);
    await ctx.scheduler.runAfter(0, internal.pipeline.embedBatch, {
      jobId,
      documentId,
      chunkIds: batchChunkIds,
      retryCount: 0,
    });
  }
}

export const embedBatch = internalAction({
  args: {
    jobId: v.id("processingJobs"),
    documentId: v.id("documents"),
    chunkIds: v.array(v.id("chunks")),
    retryCount: v.number(),
  },
  handler: async (ctx, { jobId, documentId, chunkIds, retryCount }) => {
    try {
      const embedder = createEmbeddingProvider();
      const vectorStore = createVectorStore();

      // Fetch chunk contents
      const chunks = await Promise.all(
        chunkIds.map((id) => ctx.runQuery(internal.helpers.getChunk, { id })),
      );

      // Get document for userId
      const doc = await ctx.runQuery(internal.documents.getInternal, { id: documentId });
      if (!doc) throw new Error(`Document ${documentId} not found`);

      const validChunks = chunks.filter(
        (c): c is NonNullable<typeof c> => c !== null && !c.embedded,
      );

      if (validChunks.length === 0) {
        // All chunks already embedded — mark batch complete
        const job = await ctx.runMutation(internal.processingJobs.markBatchComplete, {
          id: jobId,
          failed: false,
        });
        await checkCompletion(ctx, job, documentId);
        return;
      }

      const texts = validChunks.map((c) => c.content);
      const vectors = await embedder.embed(texts);

      // Build vector points with deterministic IDs
      const points = validChunks.map((chunk, i) => ({
        id: chunk._id as string,
        vector: vectors[i],
        payload: {
          chunkId: chunk._id as string,
          documentId: documentId as string,
          chunkIndex: chunk.chunkIndex,
          userId: doc.userId,
        },
      }));

      await vectorStore.upsert(points);

      // Mark each chunk as embedded
      for (const chunk of validChunks) {
        await ctx.runMutation(internal.chunks.markEmbedded, {
          chunkId: chunk._id,
          embeddingId: chunk._id as string,
        });
      }

      // Mark batch complete and check fan-in
      const job = await ctx.runMutation(internal.processingJobs.markBatchComplete, {
        id: jobId,
        failed: false,
      });
      await checkCompletion(ctx, job, documentId);
    } catch (error) {
      console.error(`[embedBatch] Error (attempt ${retryCount}):`, error);

      if (retryCount < MAX_EMBED_RETRIES) {
        const delayMs = Math.pow(2, retryCount) * 1000;
        await ctx.scheduler.runAfter(delayMs, internal.pipeline.embedBatch, {
          jobId,
          documentId,
          chunkIds,
          retryCount: retryCount + 1,
        });
        return;
      }

      // Retries exhausted
      const job = await ctx.runMutation(internal.processingJobs.markBatchComplete, {
        id: jobId,
        failed: true,
      });
      await checkCompletion(ctx, job, documentId);
    }
  },
});

async function checkCompletion(
  ctx: ActionCtx,
  job: { totalBatches: number; completedBatches: number; failedBatches: number },
  documentId: Id<"documents">,
) {
  if (job.completedBatches + job.failedBatches < job.totalBatches) {
    return;
  }

  if (job.failedBatches > 0) {
    await ctx.runMutation(internal.documents.updateStatus, {
      id: documentId,
      status: "error",
      errorMessage: `${job.failedBatches}/${job.totalBatches} embedding batches failed`,
      failedAt: "embedding",
    });
  } else {
    await ctx.runMutation(internal.documents.updateStatus, {
      id: documentId,
      status: "ready",
    });
  }
}

// --- Resumability ---

export const resumeProcessing = internalAction({
  args: { documentId: v.id("documents") },
  handler: async (ctx, { documentId }) => {
    const doc = await ctx.runQuery(internal.documents.getInternal, { id: documentId });
    if (!doc) throw new Error(`Document ${documentId} not found`);
    if (doc.status !== "error") return;

    switch (doc.failedAt) {
      case "parsing":
        if (doc.datalabCheckUrl) {
          // Resume polling from saved checkpoint
          await ctx.runMutation(internal.documents.updateStatus, {
            id: documentId,
            status: "parsing",
          });
          await ctx.scheduler.runAfter(0, internal.pipeline.pollDatalabResult, {
            documentId,
            checkUrl: doc.datalabCheckUrl,
            attempt: 0,
            startedAt: Date.now(),
          });
        } else {
          // Re-start processing from scratch
          await ctx.scheduler.runAfter(0, internal.pipeline.startProcessing, {
            documentId,
          });
        }
        break;

      case "chunking": {
        const allChunks = await ctx.runQuery(internal.chunks.listByDocumentInternal, {
          documentId,
        });
        if (allChunks.length > 0) {
          // Chunks exist — skip to embedding
          await ctx.runMutation(internal.documents.updateStatus, {
            id: documentId,
            status: "embedding",
          });
          await ctx.scheduler.runAfter(0, internal.pipeline.embedUnembeddedChunks, {
            documentId,
          });
        } else {
          // No chunks — re-start from scratch
          await ctx.scheduler.runAfter(0, internal.pipeline.startProcessing, {
            documentId,
          });
        }
        break;
      }

      case "embedding":
        await ctx.runMutation(internal.documents.updateStatus, {
          id: documentId,
          status: "embedding",
        });
        await ctx.scheduler.runAfter(0, internal.pipeline.embedUnembeddedChunks, {
          documentId,
        });
        break;

      default:
        // No failedAt — restart from scratch
        await ctx.scheduler.runAfter(0, internal.pipeline.startProcessing, {
          documentId,
        });
        break;
    }
  },
});

export const embedUnembeddedChunks = internalAction({
  args: { documentId: v.id("documents") },
  handler: async (ctx, { documentId }) => {
    const unembedded = await ctx.runQuery(internal.chunks.listUnembedded, {
      documentId,
    });

    if (unembedded.length === 0) {
      // All chunks already embedded
      await ctx.runMutation(internal.documents.updateStatus, {
        id: documentId,
        status: "ready",
      });
      return;
    }

    const chunkIds = unembedded.map((c) => c._id);
    await fanOutEmbedding(ctx, documentId, chunkIds);
  },
});
