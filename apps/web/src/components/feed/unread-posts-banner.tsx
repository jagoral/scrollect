import { ArrowDown, Sparkles, X } from "lucide-react";

import { Button } from "@/components/ui/button";

interface UnreadPostsBannerProps {
  count: number;
  scopeLabel: string;
  onJump: () => void;
  onDismiss: () => void;
}

export function UnreadPostsBanner({
  count,
  scopeLabel,
  onJump,
  onDismiss,
}: UnreadPostsBannerProps) {
  if (count === 0) return null;

  const postLabel = count === 1 ? "post" : "posts";

  return (
    <div
      data-testid="feed-new-posts-banner"
      className="sticky top-14 z-30 border-b border-border bg-background/95 px-4 py-3 backdrop-blur md:px-6"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center border border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
            <Sparkles className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">
              {count} new {postLabel}
            </p>
            <p className="truncate text-xs text-muted-foreground">Ready in {scopeLabel}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button size="sm" onClick={onJump} data-testid="feed-jump-to-new-posts">
            <ArrowDown className="size-3.5" data-icon="inline-start" />
            Jump to new posts
          </Button>
          <Button variant="ghost" size="sm" onClick={onDismiss} data-testid="feed-stay-here">
            <X className="size-3.5" data-icon="inline-start" />
            Stay here
          </Button>
        </div>
      </div>
    </div>
  );
}
