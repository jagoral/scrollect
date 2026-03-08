import { v } from "convex/values";

export const fileType = v.union(v.literal("pdf"), v.literal("md"));

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
