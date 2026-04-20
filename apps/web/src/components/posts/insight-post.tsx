import Markdown from "react-markdown";

import { PostShell } from "./post-shell";
import type { PostView } from "./types";

interface InsightPostProps {
  post: PostView;
}

export function InsightPost({ post }: InsightPostProps) {
  return (
    <PostShell post={post}>
      <div
        data-testid="insight-content"
        className="prose prose-sm prose-neutral max-w-none text-[15.5px] leading-[1.62] [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 dark:prose-invert"
      >
        <Markdown>{post.content}</Markdown>
      </div>
    </PostShell>
  );
}
