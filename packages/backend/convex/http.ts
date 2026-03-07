import { httpRouter } from "convex/server";

import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { authComponent, createAuth } from "./auth";

function validateProcessingAuth(request: Request): boolean {
  const secret = process.env.PROCESSING_SECRET;
  if (!secret) return false;
  const auth = request.headers.get("Authorization");
  return auth === `Bearer ${secret}`;
}

const http = httpRouter();

authComponent.registerRoutes(http, createAuth);

http.route({
  path: "/api/processing/store-chunks",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!validateProcessingAuth(request)) {
      return new Response("Unauthorized", { status: 401 });
    }

    const body = await request.json();
    const { documentId, chunks } = body as {
      documentId: string;
      chunks: { content: string; tokenCount: number }[];
    };

    const chunkIds = await ctx.runMutation(internal.chunks.createBatch, {
      documentId: documentId as never,
      chunks,
    });

    return new Response(JSON.stringify({ chunkIds }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }),
});

http.route({
  path: "/api/processing/update-status",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!validateProcessingAuth(request)) {
      return new Response("Unauthorized", { status: 401 });
    }

    const body = await request.json();
    const { documentId, status, chunkCount, errorMessage } = body as {
      documentId: string;
      status: string;
      chunkCount?: number;
      errorMessage?: string;
    };

    await ctx.runMutation(internal.documents.updateStatus, {
      id: documentId as never,
      status: status as "pending" | "processing" | "ready" | "error",
      chunkCount,
      errorMessage,
    });

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }),
});

http.route({
  path: "/api/processing/update-embeddings",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!validateProcessingAuth(request)) {
      return new Response("Unauthorized", { status: 401 });
    }

    const body = await request.json();
    const { updates } = body as {
      updates: {
        chunkId: string;
        embeddingStatus: string;
        qdrantPointId?: string;
      }[];
    };

    for (const update of updates) {
      await ctx.runMutation(internal.helpers.updateChunkEmbedding, {
        id: update.chunkId as never,
        embeddingStatus: update.embeddingStatus as "embedded" | "error",
        qdrantPointId: update.qdrantPointId,
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }),
});

export default http;
