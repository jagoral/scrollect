import type { Doc } from "@scrollect/backend/convex/_generated/dataModel";
import { Link } from "@tanstack/react-router";

import { resolveTopicColor, resolveTopicIcon } from "@/components/topics/topic-appearance";
import { cn } from "@/lib/utils";

interface LibraryRowTopicChipProps {
  topic: Doc<"topics"> | null;
}

export function LibraryRowTopicChip({ topic }: LibraryRowTopicChipProps) {
  if (!topic) return null;

  const colorMeta = resolveTopicColor(topic.color);
  const { Icon } = resolveTopicIcon(topic.icon);

  return (
    <Link
      to="/app/feed"
      search={{ topicId: topic._id }}
      data-testid="library-row-topic-chip"
      className={cn(
        "pointer-events-auto relative z-20 inline-flex max-w-[14rem] cursor-pointer items-center gap-1.5 border px-2 py-[3px] font-mono text-[10px] uppercase tracking-[0.18em] transition-colors outline-none",
        "focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0",
        colorMeta.accent,
        "hover:brightness-110",
      )}
    >
      <Icon className="size-3 shrink-0" aria-hidden />
      <span className="truncate normal-case tracking-normal text-[11px] font-medium">
        {topic.name}
      </span>
    </Link>
  );
}
