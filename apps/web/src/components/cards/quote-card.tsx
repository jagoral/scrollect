"use client";

import { CardShell, SourceBadge } from "./card-shell";
import type { PostCardData, QuoteTypeData } from "./types";

interface QuoteCardProps {
  post: PostCardData & { typeData: QuoteTypeData };
}

export function QuoteCard({ post }: QuoteCardProps) {
  const { quotedText, attribution } = post.typeData;

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
      </div>
    </CardShell>
  );
}
