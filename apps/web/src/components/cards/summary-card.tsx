"use client";

import Markdown from "react-markdown";

import { Badge } from "@/components/ui/badge";

import { CardShell, SourceBadge } from "./card-shell";
import type { PostCardData, SummaryTypeData } from "./types";

interface SummaryCardProps {
  post: PostCardData & { typeData: SummaryTypeData };
}

export function SummaryCard({ post }: SummaryCardProps) {
  const { bulletPoints } = post.typeData;

  return (
    <CardShell post={post} accentClassName="via-blue-500/30 group-hover/card:via-blue-500/60">
      <div className="mb-3 flex items-center gap-2">
        <SourceBadge post={post} className="mb-0" />
        <Badge
          data-testid="summary-badge"
          className="bg-blue-500/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400"
        >
          Summary
        </Badge>
      </div>
      {bulletPoints.length > 0 ? (
        <ul data-testid="summary-bullets" className="space-y-1.5 text-sm text-foreground/80">
          {bulletPoints.map((point, index) => (
            <li key={index} className="flex gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-blue-500/40" />
              <span>{point}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div
          data-testid="summary-content"
          className="prose prose-sm prose-neutral dark:prose-invert max-w-none leading-relaxed [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
        >
          <Markdown>{post.content}</Markdown>
        </div>
      )}
    </CardShell>
  );
}
