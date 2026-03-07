"use node";

import { v } from "convex/values";

import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";

export const processDocument = internalAction({
  args: {
    documentId: v.id("documents"),
  },
  handler: async (ctx, args) => {
    const processingUrl = process.env.PROCESSING_URL;
    const processingSecret = process.env.PROCESSING_SECRET;
    if (!processingUrl || !processingSecret) {
      throw new Error("PROCESSING_URL and PROCESSING_SECRET environment variables are required");
    }

    const doc = await ctx.runQuery(internal.helpers.getDocument, {
      id: args.documentId,
    });
    if (!doc) {
      throw new Error(`Document ${args.documentId} not found`);
    }

    const storageUrl = await ctx.storage.getUrl(doc.storageId);
    if (!storageUrl) {
      throw new Error("File not found in storage");
    }

    const response = await fetch(`${processingUrl}/process`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${processingSecret}`,
      },
      body: JSON.stringify({
        documentId: args.documentId,
        storageUrl,
        fileType: doc.fileType,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Processing API error: ${response.status} ${errorText}`);
    }
  },
});
