"use client";

import Markdown from "react-markdown";

import { CardShell, SourceBadge } from "./card-shell";
import type { PostCardData } from "./types";

interface InsightCardProps {
  post: PostCardData;
}

export function InsightCard({ post }: InsightCardProps) {
  return (
    <CardShell post={post}>
      <SourceBadge post={post} />
      <div
        data-testid="insight-content"
        className="prose prose-sm prose-neutral dark:prose-invert max-w-none leading-relaxed [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
      >
        <Markdown>{post.content}</Markdown>
      </div>
    </CardShell>
  );
}
