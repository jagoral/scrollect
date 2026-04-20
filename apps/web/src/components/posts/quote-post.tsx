import { PostShell } from "./post-shell";
import type { PostView, QuoteTypeData } from "./types";

interface QuotePostProps {
  post: PostView & { typeData: QuoteTypeData };
}

export function QuotePost({ post }: QuotePostProps) {
  const { quotedText, attribution } = post.typeData;

  return (
    <PostShell post={post}>
      <div>
        <blockquote
          data-testid="quoted-text"
          className="relative pl-8 font-logo text-[25px] font-medium leading-[1.3] tracking-tight text-foreground"
        >
          <span
            aria-hidden
            className="absolute -top-2 left-0 font-logo text-[72px] font-semibold leading-none text-amber-500/45"
          >
            &ldquo;
          </span>
          {quotedText}
        </blockquote>
        {attribution && (
          <p
            data-testid="quote-attribution"
            className="mt-3 pl-8 font-mono text-[11px] uppercase tracking-[0.16em] text-amber-600/90 dark:text-amber-400/90"
          >
            &mdash; {attribution}
          </p>
        )}
        {post.content && (
          <p
            data-testid="quote-context"
            className="mt-3 border-l border-border pl-3 text-[13.5px] leading-[1.55] text-muted-foreground"
          >
            {post.content}
          </p>
        )}
      </div>
    </PostShell>
  );
}
