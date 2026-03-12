"use client";

import {
  ConnectionCard,
  InsightCard,
  QuizMcCard,
  QuizRevealCard,
  QuoteCard,
  SummaryCard,
} from "@/components/cards";
import type { PostCardData } from "@/components/cards/types";

export type { PostCardData };

interface PostCardProps {
  post: PostCardData;
}

export function PostCard({ post }: PostCardProps) {
  const { typeData } = post;

  switch (typeData.type) {
    case "insight":
      return <InsightCard post={post} />;
    case "quiz":
      if (typeData.variant === "multiple_choice") {
        return <QuizMcCard post={{ ...post, typeData }} />;
      }
      return <QuizRevealCard post={{ ...post, typeData }} />;
    case "quote":
      return <QuoteCard post={{ ...post, typeData }} />;
    case "summary":
      return <SummaryCard post={{ ...post, typeData }} />;
    case "connection":
      return <ConnectionCard post={{ ...post, typeData }} />;
    default: {
      const _exhaustive: never = typeData;
      return null;
    }
  }
}
