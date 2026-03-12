"use client";

import { Sparkles, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import type { DocumentTag } from "./types";

interface TagBadgeProps {
  tag: DocumentTag;
  onRemove?: (tag: DocumentTag) => void;
  size?: "sm" | "default";
}

export function TagBadge({ tag, onRemove, size = "default" }: TagBadgeProps) {
  const isAi = tag.source === "ai";
  const isSmall = size === "sm";

  return (
    <Badge
      variant="outline"
      data-testid={`tag-badge-${tag.tagName}`}
      data-tag-source={tag.source}
      className={cn(
        "gap-1 font-normal",
        isAi
          ? "border-primary/20 bg-primary/5 text-primary dark:border-primary/30 dark:bg-primary/10"
          : "border-border/60 bg-muted/50 text-muted-foreground",
        isSmall && "h-[18px] px-1.5 text-[11px]",
      )}
    >
      {isAi && <Sparkles className={cn("shrink-0", isSmall ? "size-2.5" : "size-3")} />}
      <span className={cn("truncate", isSmall ? "max-w-24" : "max-w-36")}>{tag.tagName}</span>
      {onRemove && (
        <button
          type="button"
          data-testid={`tag-remove-${tag.tagName}`}
          className="-mr-0.5 rounded-full p-0.5 transition-colors hover:bg-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onRemove(tag);
          }}
        >
          <X className="size-3" />
        </button>
      )}
    </Badge>
  );
}
