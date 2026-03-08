"use node";

import type { GenericCtx } from "@convex-dev/better-auth";
import OpenAI from "openai";
import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { DataModel, Id } from "./_generated/dataModel";
import { action } from "./_generated/server";
import { authComponent } from "./auth";
import { WideEvent } from "./logging";

function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY environment variable is required");
  }
  return new OpenAI({ apiKey });
}

export const generate = action({
  args: { count: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const postCount = args.count ?? 5;
    const evt = new WideEvent("feedGeneration.generate");
    try {
      const user = await authComponent.safeGetAuthUser(ctx as unknown as GenericCtx<DataModel>);
      if (!user) {
        throw new Error("Not authenticated");
      }

      evt.set("userId", user._id);

      // Get all ready documents for this user
      const documents = await ctx.runQuery(internal.feed.listReadyDocuments, {
        userId: user._id,
      });

      evt.set("readyDocuments", documents.length);

      if (documents.length === 0) {
        throw new Error("No ready documents found. Upload and process a document first.");
      }

      // Gather chunks from all ready documents
      const allChunks: { _id: Id<"chunks">; content: string; documentId: Id<"documents"> }[] = [];
      for (const doc of documents) {
        const chunks = await ctx.runQuery(internal.feed.listChunksForDocument, {
          documentId: doc._id,
        });
        for (const chunk of chunks) {
          allChunks.push({
            _id: chunk._id,
            content: chunk.content,
            documentId: doc._id,
          });
        }
      }

      evt.set("totalChunks", allChunks.length);

      if (allChunks.length === 0) {
        throw new Error("No chunks available to generate feed from.");
      }

      // Pick random chunks to base posts on
      const selected = shuffle(allChunks).slice(0, postCount);
      evt.set("selectedChunks", selected.length);

      const openai = getOpenAIClient();
      const model = "gpt-4o-mini";
      evt.set("model", model);

      const systemPrompt = `You are an AI learning assistant for Scrollect, a personal learning feed app.
Your job is to transform raw text chunks from documents into engaging, bite-sized learning cards.

Each card should:
- Be concise (2-4 sentences)
- Highlight one key insight, fact, or concept
- Be written in a clear, engaging tone
- Stand on its own without needing additional context
- Use light Markdown formatting: **bold** for key terms, and occasional bullet points when listing related ideas

Return a JSON object with a "posts" key containing an array of exactly ${selected.length} strings, one for each input chunk.`;

      const userPrompt = selected
        .map((chunk, i) => `Chunk ${i + 1}:\n${chunk.content}`)
        .join("\n\n---\n\n");

      const response = await openai.chat.completions.create({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7,
        response_format: { type: "json_object" },
      });

      const raw = response.choices[0]?.message?.content ?? "{}";
      let posts: string[];
      try {
        const parsed = JSON.parse(raw);
        // Handle both direct array and wrapped object (e.g. { "posts": [...] })
        posts = Array.isArray(parsed)
          ? parsed
          : Array.isArray(parsed.posts)
            ? parsed.posts
            : ((Object.values(parsed).find(Array.isArray) as string[]) ?? []);
      } catch (error) {
        evt.set("aiRawResponse", raw.substring(0, 500));
        evt.setError(error);
        throw new Error("Failed to parse AI response");
      }

      evt.set("postsGenerated", posts.length);

      // Store posts in the database
      const postIds: Id<"posts">[] = [];
      for (let i = 0; i < posts.length; i++) {
        const chunk = selected[i]!;
        const content = posts[i]!;
        const id = await ctx.runMutation(internal.feed.createPost, {
          content,
          sourceChunkId: chunk._id,
          sourceDocumentId: chunk.documentId,
          userId: user._id,
        });
        postIds.push(id);
      }

      return postIds;
    } catch (error) {
      evt.setError(error);
      throw error;
    } finally {
      evt.emit();
    }
  },
});

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}
