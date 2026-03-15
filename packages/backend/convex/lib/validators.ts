import type { Infer } from "convex/values";
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
  v.literal("summarizing"),
  v.literal("ready"),
  v.literal("deleting"),
  v.literal("error"),
);

export const failedAtStage = v.union(
  v.literal("parsing"),
  v.literal("chunking"),
  v.literal("embedding"),
  v.literal("summarizing"),
);

export const reactionType = v.union(v.literal("like"), v.literal("dislike"));

export const tagSource = v.union(v.literal("ai"), v.literal("manual"));

export type TagSource = Infer<typeof tagSource>;

export const reactionInput = v.union(v.literal("like"), v.literal("dislike"), v.literal("none"));

export const postType = v.union(
  v.literal("insight"),
  v.literal("quiz"),
  v.literal("quote"),
  v.literal("summary"),
  v.literal("connection"),
);

export const quizVariant = v.union(v.literal("multiple_choice"), v.literal("true_false"));

export const typeData = v.union(
  v.object({
    type: v.literal("insight"),
  }),
  v.object({
    type: v.literal("quiz"),
    variant: quizVariant,
    question: v.string(),
    options: v.array(v.string()),
    correctIndex: v.number(),
    explanation: v.string(),
  }),
  v.object({
    type: v.literal("quote"),
    quotedText: v.string(),
    attribution: v.optional(v.string()),
  }),
  v.object({
    type: v.literal("summary"),
    bulletPoints: v.array(v.string()),
  }),
  v.object({
    type: v.literal("connection"),
    sourceATitleHint: v.string(),
    sourceBTitleHint: v.string(),
  }),
);

export type PostType = Infer<typeof postType>;
export type QuizVariant = Infer<typeof quizVariant>;
export type TypeData = Infer<typeof typeData>;

// Must be kept in sync with the postType union above.
export const ALL_POST_TYPES: PostType[] = ["insight", "quiz", "quote", "summary", "connection"];
