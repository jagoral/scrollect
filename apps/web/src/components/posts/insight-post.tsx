import Markdown from "react-markdown";

import { PostShell, SourceBadge } from "./post-shell";
import type { PostView } from "./types";

interface InsightPostProps {
  post: PostView;
}

export function InsightPost({ post }: InsightPostProps) {
  return (
    <PostShell post={post}>
      <SourceBadge post={post} />
      <div
        data-testid="insight-content"
        className="prose prose-sm prose-neutral dark:prose-invert max-w-none leading-relaxed [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
      >
        <Markdown>{post.content}</Markdown>
      </div>
    </PostShell>
  );
}
