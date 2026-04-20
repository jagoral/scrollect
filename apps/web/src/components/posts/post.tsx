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
}

export function Post({ post }: PostProps) {
  const { typeData } = post;

  switch (typeData.type) {
    case "insight":
      return <InsightPost post={post} />;
    case "quiz":
      if (typeData.variant === "multiple_choice") {
        return <QuizMcPost post={{ ...post, typeData }} />;
      }
      return <QuizRevealPost post={{ ...post, typeData }} />;
    case "quote":
      return <QuotePost post={{ ...post, typeData }} />;
    case "summary":
      return <SummaryPost post={{ ...post, typeData }} />;
    case "connection":
      return <ConnectionPost post={{ ...post, typeData }} />;
    default:
      typeData satisfies never;
      return null;
  }
}
