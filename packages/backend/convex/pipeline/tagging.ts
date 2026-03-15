"use node";

import { generateText, Output } from "ai";
import { v } from "convex/values";
import { z } from "zod";

import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { WideEvent } from "../lib/logging";
import { ai } from "../providers/ai";

const MAX_SAMPLE_CHUNKS = 5;
const MAX_CHUNK_CHARS = 1500;

const tagSchema = z.object({ tags: z.array(z.string()) });

function buildTagSuggestionPrompt(): string {
  return `You are a topic classifier for a personal learning app.
Given text chunks from a document, suggest 3-5 topic tags that best describe the content.

Rules:
- Tags should be broad enough to apply across multiple documents (e.g., "machine learning" not "chapter 3 summary")
- Use natural language (e.g., "distributed systems", "React", "personal finance")
- Prefer well-known terms over jargon
- Return 3-5 tags, no more

Return a JSON object: { "tags": ["tag1", "tag2", "tag3"] }`;
}

function sampleChunks<T>(chunks: T[], maxSamples: number): T[] {
  if (chunks.length <= maxSamples) return chunks;

  const indices: number[] = [0];
  const remaining = maxSamples - 2;
  const step = (chunks.length - 1) / (remaining + 1);
  for (let i = 1; i <= remaining; i++) {
    indices.push(Math.round(step * i));
  }
  indices.push(chunks.length - 1);

  return [...new Set(indices)].sort((a, b) => a - b).map((i) => chunks[i]!);
}

export const autoSuggest = internalAction({
  args: {
    documentId: v.id("documents"),
  },
  handler: async (ctx, { documentId }) => {
    const evt = new WideEvent("pipeline.autoSuggestTags");
    evt.set({ documentId });
    try {
      const doc = await ctx.runQuery(internal.documents.getInternal, { id: documentId });
      if (!doc) throw new Error(`Document ${documentId} not found`);
      evt.set("userId", doc.userId);

      if (doc.tagSources?.includes("ai")) {
        evt.set("skipped", "already has AI tags");
        return;
      }

      const allChunks = await ctx.runQuery(internal.chunks.listByDocumentInternal, {
        documentId,
      });
      evt.set("totalChunks", allChunks.length);

      if (allChunks.length === 0) {
        evt.set("skipped", "no chunks");
        return;
      }

      const sampled = sampleChunks(allChunks, MAX_SAMPLE_CHUNKS);
      evt.set("sampledChunks", sampled.length);

      const userPrompt = sampled
        .map((chunk, i) => {
          const content =
            chunk.content.length > MAX_CHUNK_CHARS
              ? chunk.content.slice(0, MAX_CHUNK_CHARS) + "..."
              : chunk.content;
          return `Chunk ${i + 1}:\n${content}`;
        })
        .join("\n\n---\n\n");

      const { output } = await generateText({
        model: ai.languageModel("fast"),
        output: Output.object({ schema: tagSchema }),
        system: buildTagSuggestionPrompt(),
        prompt: userPrompt,
        temperature: 0.3,
        maxRetries: 2,
      });

      const tagNames = output?.tags ?? [];
      evt.set("suggestedTags", tagNames.length);

      const validTags = tagNames
        .filter((t): t is string => typeof t === "string" && t.trim().length > 0)
        .slice(0, 5);

      for (const tagName of validTags) {
        await ctx.runMutation(internal.tags.addTagToDocumentInternal, {
          documentId,
          userId: doc.userId,
          name: tagName,
          source: "ai",
        });
      }

      evt.set("storedTags", validTags.length);
    } catch (error) {
      evt.setError(error);
    } finally {
      evt.emit();
    }
  },
});
