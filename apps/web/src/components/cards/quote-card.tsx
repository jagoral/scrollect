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
    <CardShell post={post} accentClassName="via-amber-500/30 group-hover/card:via-amber-500/60">
      <SourceBadge post={post} />
      <div className="relative pl-4">
        <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-full bg-amber-500/40" />
        <span
          className="pointer-events-none absolute -left-1 -top-3 font-serif text-4xl leading-none text-amber-500/20 select-none"
          aria-hidden="true"
        >
          &ldquo;
        </span>
        <blockquote
          data-testid="quoted-text"
          className="text-base leading-relaxed italic text-foreground/90"
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
            )}
            onClick={() => setExpanded((prev) => !prev)}
          >
            {post.content}
          </p>
        )}
      </div>
    </CardShell>
  );
}
