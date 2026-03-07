import { Hono } from "hono";
import { QdrantClient } from "@qdrant/js-client-rest";
import OpenAI from "openai";

// ---------------------------------------------------------------------------
// Env helpers
// ---------------------------------------------------------------------------

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

// ---------------------------------------------------------------------------
// Convex callback helper
// ---------------------------------------------------------------------------

async function convexCallback(path: string, body: object): Promise<unknown> {
  const baseUrl = requireEnv("CONVEX_URL");
  const secret = requireEnv("PROCESSING_SECRET");

  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Convex callback ${path} failed (${response.status}): ${text}`);
  }

  return response.json();
}

// ---------------------------------------------------------------------------
// Chunking
// ---------------------------------------------------------------------------

const TARGET_CHUNK_SIZE = 750;
const CHUNK_OVERLAP = 50;
const MIN_CHUNK_SIZE = 100;

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function chunkContent(text: string): { content: string; tokenCount: number }[] {
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
      chunks.push({
        content: chunkText,
        tokenCount: estimateTokens(chunkText),
      });
    }

    start = end - charOverlap;
    if (start >= text.length) break;
  }

  return chunks;
}

function chunkMarkdown(text: string): { content: string; tokenCount: number }[] {
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

// ---------------------------------------------------------------------------
// Datalab PDF parsing (poll-based)
// ---------------------------------------------------------------------------

async function parsePdf(fileUrl: string): Promise<string> {
  const apiKey = requireEnv("DATALAB_API_KEY");

  // Submit
  const formData = new FormData();
  formData.append("file_url", fileUrl);
  formData.append("output_format", "markdown");
  formData.append("mode", "accurate");
  formData.append("disable_image_extraction", "true");

  const submitResponse = await fetch("https://www.datalab.to/api/v1/convert", {
    method: "POST",
    headers: { "X-API-Key": apiKey },
    body: formData,
  });

  if (!submitResponse.ok) {
    throw new Error(`Datalab submission failed: ${submitResponse.status}`);
  }

  const { success, request_check_url } = (await submitResponse.json()) as {
    success: boolean;
    request_check_url?: string;
  };
  if (!success || !request_check_url) {
    throw new Error("Datalab did not return a valid check URL");
  }

  // Poll (up to 5 minutes)
  for (let attempt = 0; attempt < 60; attempt++) {
    await new Promise((r) => setTimeout(r, 5000));
    const checkResponse = await fetch(request_check_url, {
      headers: { "X-API-Key": apiKey },
    });
    if (!checkResponse.ok) continue;

    const result = (await checkResponse.json()) as {
      status: string;
      success: boolean;
      markdown?: string;
    };
    if (result.status === "complete") {
      if (!result.success) throw new Error("Datalab conversion failed");
      const markdown = result.markdown?.trim();
      if (!markdown) throw new Error("No text extracted from PDF");
      return markdown;
    }
  }
  throw new Error("Datalab timed out after 5 minutes");
}

// ---------------------------------------------------------------------------
// OpenAI embeddings
// ---------------------------------------------------------------------------

async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const openai = new OpenAI({ apiKey: requireEnv("OPENAI_API_KEY") });
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: texts,
  });
  return response.data.map((d) => d.embedding);
}

// ---------------------------------------------------------------------------
// Qdrant
// ---------------------------------------------------------------------------

const COLLECTION_NAME = "scrollect_chunks";
const VECTOR_SIZE = 1536;

function getQdrantClient(): QdrantClient {
  return new QdrantClient({
    url: requireEnv("QDRANT_URL"),
    apiKey: requireEnv("QDRANT_API_KEY"),
  });
}

async function ensureCollection(): Promise<void> {
  const qdrant = getQdrantClient();
  const collections = await qdrant.getCollections();
  if (!collections.collections.some((c) => c.name === COLLECTION_NAME)) {
    await qdrant.createCollection(COLLECTION_NAME, {
      vectors: { size: VECTOR_SIZE, distance: "Cosine" },
    });
  }
}

// ---------------------------------------------------------------------------
// Document processing pipeline
// ---------------------------------------------------------------------------

async function processDocument(
  documentId: string,
  storageUrl: string,
  fileType: string,
): Promise<void> {
  try {
    // 1. Update status
    await convexCallback("/api/processing/update-status", {
      documentId,
      status: "processing",
    });

    // 2. Get text content
    let text: string;
    if (fileType === "pdf") {
      text = await parsePdf(storageUrl);
    } else {
      const response = await fetch(storageUrl);
      if (!response.ok) throw new Error(`Failed to fetch file: ${response.statusText}`);
      text = await response.text();
      if (!text.trim()) throw new Error("File is empty");
    }

    // 3. Chunk
    const chunks = chunkMarkdown(text);
    console.log(`[process] ${documentId}: ${chunks.length} chunks`);

    // 4. Store chunks in Convex
    const storeResult = (await convexCallback("/api/processing/store-chunks", {
      documentId,
      chunks,
    })) as { chunkIds: string[] };
    const { chunkIds } = storeResult;

    // 5. Update status with chunk count
    await convexCallback("/api/processing/update-status", {
      documentId,
      status: "processing",
      chunkCount: chunks.length,
    });

    // 6. Generate embeddings and store in Qdrant
    await ensureCollection();
    const qdrant = getQdrantClient();
    const BATCH_SIZE = 2048;

    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE);
      const batchChunkIds = chunkIds.slice(i, i + BATCH_SIZE);
      const texts = batch.map((c) => c.content);

      const embeddings = await generateEmbeddings(texts);

      const points = batchChunkIds.map((chunkId, idx) => ({
        id: crypto.randomUUID(),
        vector: embeddings[idx]!,
        payload: {
          chunkId,
          documentId,
          chunkIndex: i + idx,
        },
      }));

      await qdrant.upsert(COLLECTION_NAME, { points });

      // Update embedding statuses
      await convexCallback("/api/processing/update-embeddings", {
        updates: batchChunkIds.map((chunkId, idx) => ({
          chunkId,
          embeddingStatus: "embedded",
          qdrantPointId: points[idx]!.id,
        })),
      });
    }

    // 7. Mark as ready
    await convexCallback("/api/processing/update-status", {
      documentId,
      status: "ready",
      chunkCount: chunks.length,
    });

    console.log(`[process] ${documentId}: done`);
  } catch (error) {
    console.error(`[process] ${documentId}: error`, error);
    const message = error instanceof Error ? error.message : "Unknown processing error";
    await convexCallback("/api/processing/update-status", {
      documentId,
      status: "error",
      errorMessage: message,
    }).catch((e) => console.error("Failed to report error to Convex", e));
  }
}

// ---------------------------------------------------------------------------
// Hono app
// ---------------------------------------------------------------------------

const app = new Hono();

// Auth middleware for /process
app.use("/process", async (c, next) => {
  const auth = c.req.header("Authorization");
  const secret = requireEnv("PROCESSING_SECRET");
  if (auth !== `Bearer ${secret}`) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  await next();
});

app.get("/health", (c) => c.json({ ok: true }));

app.post("/process", async (c) => {
  const body = await c.req.json<{
    documentId?: string;
    storageUrl?: string;
    fileType?: string;
  }>();
  const { documentId, storageUrl, fileType } = body;

  if (!documentId || !storageUrl || !fileType) {
    return c.json({ error: "Missing required fields" }, 400);
  }

  // Fire and forget
  processDocument(documentId, storageUrl, fileType).catch((err) =>
    console.error(`[process] Unhandled error for ${documentId}:`, err),
  );

  return c.json({ accepted: true }, 202);
});

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

const port = Number(process.env.PORT || 3002);
console.log(`Processing server listening on port ${port}`);

export default {
  port,
  fetch: app.fetch,
};
