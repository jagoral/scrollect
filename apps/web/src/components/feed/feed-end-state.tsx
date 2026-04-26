import { CheckCircle, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";

interface FeedEndStateProps {
  onServe: () => void;
  serving: boolean;
}

/**
 * Footer that appears at the bottom of an exhausted feed: a "caught up" marker
 * plus a button to generate more posts in the current scope.
 */
export function FeedEndState({ onServe, serving }: FeedEndStateProps) {
  return (
    <div
      data-testid="feed-end-state"
      className="flex flex-col items-center gap-4 py-12 text-center text-muted-foreground animate-in fade-in duration-500"
    >
      <div className="flex items-center gap-4">
        <div className="h-px w-16 bg-border" />
        <div className="flex size-10 items-center justify-center border-y border border-border">
          <CheckCircle className="size-5 text-primary" />
        </div>
        <div className="h-px w-16 bg-border" />
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.1em]">
          You&apos;re all caught up
        </p>
        <p className="mt-1 text-xs text-muted-foreground/60">
          Generate more posts to keep learning.
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={onServe} disabled={serving}>
        <Sparkles className="size-3.5" />
        Generate more
      </Button>
    </div>
  );
}
