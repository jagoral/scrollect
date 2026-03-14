import { X } from "lucide-react";
import { useMemo } from "react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface TagFilterBarProps {
  allTags: { _id: string; name: string }[];
  selectedTags: Set<string>;
  onToggle: (tagName: string) => void;
  onClear: () => void;
}

export function TagFilterBar({ allTags, selectedTags, onToggle, onClear }: TagFilterBarProps) {
  const sorted = useMemo(
    () => [...allTags].sort((a, b) => a.name.localeCompare(b.name)),
    [allTags],
  );

  if (sorted.length === 0) return null;

  return (
    <div
      data-testid="tag-filter-bar"
      className="no-scrollbar -mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1"
    >
      {sorted.map((tag) => {
        const isSelected = selectedTags.has(tag.name);
        return (
          <Badge
            key={tag._id}
            render={<button type="button" />}
            variant={isSelected ? "default" : "outline"}
            data-testid={`tag-filter-${tag.name}`}
            className={cn(
              "shrink-0 cursor-pointer transition-all",
              isSelected && "gap-1",
              !isSelected && "hover:bg-muted hover:text-foreground",
            )}
            onClick={() => onToggle(tag.name)}
          >
            {tag.name}
            {isSelected && <X className="size-3" />}
          </Badge>
        );
      })}
      {selectedTags.size > 0 && (
        <button
          type="button"
          data-testid="clear-tag-filters"
          className="shrink-0 text-xs text-muted-foreground transition-colors hover:text-foreground"
          onClick={onClear}
        >
          Clear all
        </button>
      )}
    </div>
  );
}
