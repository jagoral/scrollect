"use client";

import { ArrowLeftRight } from "lucide-react";
import Link from "next/link";
import Markdown from "react-markdown";

import { Badge } from "@/components/ui/badge";

import { CardShell } from "./card-shell";
import type { ConnectionTypeData, PostCardData } from "./types";

interface ConnectionCardProps {
  post: PostCardData & { typeData: ConnectionTypeData };
}

export function ConnectionCard({ post }: ConnectionCardProps) {
  const { sourceATitleHint, sourceBTitleHint } = post.typeData;

  return (
    <CardShell post={post} accentClassName="via-violet-500/30 group-hover/card:via-violet-500/60">
      <div className="mb-3" data-testid="connection-source-badge">
        <Link href={`/library/${post.primarySourceDocumentId}`}>
          <Badge
            variant="outline"
            className="gap-1.5 border-violet-500/15 bg-violet-500/[0.03] font-normal text-muted-foreground transition-all hover:border-violet-500/25 hover:bg-violet-500/[0.06]"
          >
            <span className="max-w-28 truncate">{sourceATitleHint}</span>
            <ArrowLeftRight className="size-3 shrink-0 text-violet-500/60" />
            <span className="max-w-28 truncate">{sourceBTitleHint}</span>
          </Badge>
        </Link>
      </div>
      <div
        data-testid="connection-content"
        className="prose prose-sm prose-neutral dark:prose-invert max-w-none leading-relaxed [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
      >
        <Markdown>{post.content}</Markdown>
      </div>
    </CardShell>
  );
}
