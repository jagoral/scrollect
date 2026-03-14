"use client";

import { Badge } from "@/components/ui/badge";

import { TagBadge } from "./tag-badge";
import type { DocumentTag } from "./types";

interface TagListProps {
  tags: DocumentTag[];
  maxVisible: number;
  size?: "sm" | "default";
}

export function TagList({ tags, maxVisible, size = "sm" }: TagListProps) {
  if (tags.length === 0) return null;

  const sorted = [...tags].sort((a, b) => a.tagName.localeCompare(b.tagName));
  const visible = sorted.slice(0, maxVisible);
  const overflowCount = sorted.length - maxVisible;

  return (
    <div data-testid="tag-list" className="flex flex-wrap items-center gap-1">
      {visible.map((tag) => (
        <TagBadge key={tag.tagId} tag={tag} size={size} />
      ))}
      {overflowCount > 0 && (
        <Badge
          variant="outline"
          data-testid="tag-overflow"
          className={
            size === "sm"
              ? "h-[18px] px-1.5 text-[11px] font-normal text-muted-foreground"
              : "font-normal text-muted-foreground"
          }
        >
          +{overflowCount}
        </Badge>
      )}
    </div>
  );
}
