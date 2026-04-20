import {
  ConnectionPost,
  InsightPost,
  QuizMcPost,
  QuizRevealPost,
  QuotePost,
  SummaryPost,
} from "./index";
import type { PostView } from "./types";

export type { PostView };

interface PostProps {
  post: PostView;
  onViewed?: (postId: string) => void;
}

export function Post({ post, onViewed }: PostProps) {
  const { typeData } = post;

  switch (typeData.type) {
    case "insight":
      return <InsightPost post={post} onViewed={onViewed} />;
    case "quiz":
      if (typeData.variant === "multiple_choice") {
        return <QuizMcPost post={{ ...post, typeData }} onViewed={onViewed} />;
      }
      return <QuizRevealPost post={{ ...post, typeData }} onViewed={onViewed} />;
    case "quote":
      return <QuotePost post={{ ...post, typeData }} onViewed={onViewed} />;
    case "summary":
      return <SummaryPost post={{ ...post, typeData }} onViewed={onViewed} />;
    case "connection":
      return <ConnectionPost post={{ ...post, typeData }} onViewed={onViewed} />;
    default:
      typeData satisfies never;
      return null;
  }
}
