import { v } from "convex/values";

export const fileType = v.union(
  v.literal("pdf"),
  v.literal("md"),
  v.literal("article"),
  v.literal("youtube"),
  v.literal("text"),
);

export const urlFileType = v.union(v.literal("article"), v.literal("youtube"));

export const documentStatus = v.union(
  v.literal("uploaded"),
  v.literal("parsing"),
  v.literal("chunking"),
  v.literal("embedding"),
  v.literal("ready"),
  v.literal("error"),
);

export const failedAtStage = v.union(
  v.literal("parsing"),
  v.literal("chunking"),
  v.literal("embedding"),
);

export const reactionType = v.union(v.literal("like"), v.literal("dislike"));

export const reactionInput = v.union(v.literal("like"), v.literal("dislike"), v.literal("none"));
