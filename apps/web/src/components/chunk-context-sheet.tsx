"use client";

import { api } from "@scrollect/backend/convex/_generated/api";
import type { Id } from "@scrollect/backend/convex/_generated/dataModel";
import { useQuery } from "convex/react";
import { FileText, Loader2 } from "lucide-react";
import { useState } from "react";
import Markdown from "react-markdown";

import { formatSourceLocation } from "@/components/cards/utils";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const PREVIEW_LENGTH = 100;

function stripMarkdown(md: string): string {
  return md
    .replace(/#{1,6}\s+/g, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/`(.+?)`/g, "$1")
    .replace(/\[(.+?)\]\(.+?\)/g, "$1")
    .replace(/\n+/g, " ")
    .trim();
}

function ContextChunk({
  content,
  label,
  isPrimary = false,
}: {
  content: string;
  label: string;
  isPrimary?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const plain = stripMarkdown(content);
  const needsTruncation = plain.length > PREVIEW_LENGTH;

  return (
    <div
      className="relative mb-4 last:mb-0"
      data-testid="source-chunk"
      data-primary={isPrimary || undefined}
    >
      <div className="absolute -left-7 top-[13px] flex w-[19px] items-center justify-center">
        {isPrimary ? (
          <div className="size-2.5 rounded-full bg-primary ring-[3px] ring-primary/15" />
        ) : (
          <div className="size-1.5 rounded-full bg-muted-foreground/25" />
        )}
      </div>
      <span
        className={cn(
          "mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.1em]",
          isPrimary ? "text-primary/60" : "text-muted-foreground/40",
        )}
      >
        {label}
      </span>
      <div
        className={cn(
          "rounded-lg border p-3",
          isPrimary
            ? "border-primary/20 bg-primary/[0.04] ring-1 ring-primary/10"
            : "border-border/30 bg-muted/20",
        )}
      >
        {expanded ? (
          <div
            className={cn(
              "prose prose-sm prose-neutral dark:prose-invert max-w-none leading-relaxed [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
              !isPrimary && "text-muted-foreground/60",
            )}
          >
            <Markdown>{content}</Markdown>
          </div>
        ) : (
          <p
            className={cn(
              "text-sm leading-relaxed",
              isPrimary ? "text-foreground" : "text-muted-foreground/60",
            )}
          >
            {needsTruncation ? `${plain.slice(0, PREVIEW_LENGTH)}...` : plain}
          </p>
        )}
        {needsTruncation && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="mt-1.5 cursor-pointer text-xs font-medium text-primary/60 transition-colors hover:text-primary/90"
          >
            {expanded ? "show less" : "show more"}
          </button>
        )}
      </div>
    </div>
  );
}

function getLocationLabel(
  documentTitle: string | null,
  sectionTitle: string | null,
  pageNumber: number | null,
): string {
  return formatSourceLocation(documentTitle ?? "Untitled", sectionTitle, pageNumber);
}

interface ChunkContextSheetContentProps {
  postId: Id<"posts">;
  sourceChunkId: Id<"chunks">;
  sourceDocumentTitle: string | null;
  sectionTitle: string | null;
  pageNumber: number | null;
  chunkIndex: number;
  isOpen: boolean;
  postType?: string;
}

export function ChunkContextSheetContent({
  postId,
  sourceChunkId,
  sourceDocumentTitle,
  sectionTitle,
  pageNumber,
  chunkIndex,
  isOpen,
  postType,
}: ChunkContextSheetContentProps) {
  const chunkContext = useQuery(
    api.chunks.getWithContext,
    isOpen ? { chunkId: sourceChunkId } : "skip",
  );

  const postSources = useQuery(api.feed.queries.listSourcesByPostId, isOpen ? { postId } : "skip");

  const locationLabel = getLocationLabel(sourceDocumentTitle, sectionTitle, pageNumber);
  const hasContext = chunkContext?.previousChunk || chunkContext?.nextChunk;
  const supportingSources = postSources?.filter((s) => s.chunkId !== sourceChunkId) ?? [];
  const hasMultipleSources = supportingSources.length > 0;

  return (
    <div data-testid="source-sheet" className="flex flex-col gap-4 overflow-y-auto px-4 pb-4">
      <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-2.5 text-sm text-muted-foreground">
        <FileText className="size-4 shrink-0 text-primary/50" />
        <span className="truncate font-medium">{locationLabel}</span>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {postType && (
            <Badge
              data-testid="sheet-post-type-badge"
              variant="outline"
              className="text-[10px] capitalize"
            >
              {postType}
            </Badge>
          )}
          <span className="rounded-md bg-background px-1.5 py-0.5 font-mono text-[11px] ring-1 ring-border/60">
            #{chunkIndex + 1}
          </span>
        </div>
      </div>

      {!chunkContext && isOpen && (
        <div className="flex flex-col items-center justify-center gap-2 py-12">
          <Loader2 className="size-5 animate-spin text-primary/60" />
          <span className="text-xs text-muted-foreground">Loading context...</span>
        </div>
      )}

      {chunkContext && (
        <div className="relative pl-7">
          {hasContext && <div className="absolute left-[9px] top-4 bottom-4 w-px bg-border/60" />}

          {chunkContext.previousChunk && (
            <ContextChunk content={chunkContext.previousChunk.content} label="Previous" />
          )}

          <ContextChunk content={chunkContext.chunk.content} label="Primary source" isPrimary />

          {chunkContext.nextChunk && (
            <ContextChunk content={chunkContext.nextChunk.content} label="Next" />
          )}
        </div>
      )}

      {hasMultipleSources && (
        <div className="mt-2">
          <h4 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/60">
            Supporting sources
          </h4>
          <div className="relative pl-7">
            {supportingSources.length > 1 && (
              <div className="absolute left-[9px] top-4 bottom-4 w-px bg-border/60" />
            )}
            {supportingSources.map((source) => {
              const label = getLocationLabel(
                source.documentTitle,
                source.sectionTitle,
                source.pageNumber,
              );
              return (
                <ContextChunk key={source._id} content={source.chunkContent ?? ""} label={label} />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
