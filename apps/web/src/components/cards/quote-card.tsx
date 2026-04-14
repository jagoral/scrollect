import { useState } from "react";

import { cn } from "@/lib/utils";

import { CardShell, SourceBadge } from "./card-shell";
import type { PostCardData, QuoteTypeData } from "./types";

interface QuoteCardProps {
  post: PostCardData & { typeData: QuoteTypeData };
}

export function QuoteCard({ post }: QuoteCardProps) {
  const { quotedText, attribution } = post.typeData;
  const [expanded, setExpanded] = useState(false);

  return (
    <CardShell post={post}>
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
    </CardShell>
  );
}
