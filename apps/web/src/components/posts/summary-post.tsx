import Markdown from "react-markdown";

import { cn } from "@/lib/utils";

import { PostShell } from "./post-shell";
import type { PostView, SummaryTypeData } from "./types";

interface SummaryPostProps {
  post: PostView & { typeData: SummaryTypeData };
  onViewed?: (postId: string) => void;
}

export function SummaryPost({ post, onViewed }: SummaryPostProps) {
  const { bulletPoints } = post.typeData;

  if (bulletPoints.length === 0) {
    return (
      <PostShell post={post} onViewed={onViewed}>
        <div
          data-testid="summary-content"
          className="prose prose-sm prose-neutral max-w-none leading-relaxed [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 dark:prose-invert"
        >
          <Markdown>{post.content}</Markdown>
        </div>
      </PostShell>
    );
  }

  return (
    <PostShell post={post} onViewed={onViewed}>
      <div>
        {post.sectionTitle && (
          <p className="mb-3 font-logo text-[19px] font-medium tracking-tight text-foreground">
            {post.sectionTitle}
          </p>
        )}
        <ol data-testid="summary-bullets" className="m-0 list-none p-0">
          {bulletPoints.map((pt, i) => (
            <li
              key={i}
              className={cn(
                "grid grid-cols-[32px_1fr] gap-1 py-2",
                i > 0 && "border-t border-dashed border-border",
              )}
            >
              <span className="pt-0.5 font-mono text-[11px] tracking-wide text-blue-500">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="text-[14.5px] leading-[1.55] text-foreground/90">{pt}</span>
            </li>
          ))}
        </ol>
      </div>
    </PostShell>
  );
}
