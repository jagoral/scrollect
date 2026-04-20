import { useState } from "react";

import { cn } from "@/lib/utils";

import { PostShell, SourceBadge } from "./post-shell";
import type { PostView, QuoteTypeData } from "./types";

interface QuotePostProps {
  post: PostView & { typeData: QuoteTypeData };
}

export function QuotePost({ post }: QuotePostProps) {
  const { quotedText, attribution } = post.typeData;
  const [expanded, setExpanded] = useState(false);

  return (
    <PostShell post={post}>
      <SourceBadge post={post} />
      <div>
        <blockquote
          data-testid="quoted-text"
          className="text-base leading-relaxed text-foreground/90"
        >
          {quotedText}
        </blockquote>
        {attribution && (
          <p data-testid="quote-attribution" className="mt-2 text-sm text-muted-foreground/70">
            &mdash; {attribution}
          </p>
        )}
        {post.content && (
          <p
            data-testid="quote-context"
            className={cn(
              "mt-1.5 cursor-pointer text-xs not-italic text-muted-foreground/50",
              !expanded && "line-clamp-2",
              expanded && "text-sm",
            )}
            onClick={(e) => {
              e.stopPropagation();
              setExpanded((prev) => !prev);
            }}
          >
            {post.content}
          </p>
        )}
      </div>
    </PostShell>
  );
}
