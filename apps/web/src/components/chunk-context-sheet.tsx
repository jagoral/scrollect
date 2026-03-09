"use client";

import { api } from "@scrollect/backend/convex/_generated/api";
import type { Id } from "@scrollect/backend/convex/_generated/dataModel";
import { useQuery } from "convex/react";
import { FileText, Loader2 } from "lucide-react";
import Markdown from "react-markdown";

import { cn } from "@/lib/utils";

interface ChunkContextSheetContentProps {
  sourceChunkId: Id<"chunks">;
  sourceDocumentTitle: string | null;
  sectionTitle: string | null;
  pageNumber: number | null;
  chunkIndex: number;
  isOpen: boolean;
}

export function ChunkContextSheetContent({
  sourceChunkId,
  sourceDocumentTitle,
  sectionTitle,
  pageNumber,
  chunkIndex,
  isOpen,
}: ChunkContextSheetContentProps) {
  const chunkContext = useQuery(
    api.chunks.getWithContext,
    isOpen ? { chunkId: sourceChunkId } : "skip",
  );

  const locationLabel = sectionTitle
    ? `${sourceDocumentTitle ?? "Untitled"} · ${sectionTitle}`
    : pageNumber != null
      ? `${sourceDocumentTitle ?? "Untitled"} · Page ~${pageNumber}`
      : (sourceDocumentTitle ?? "Untitled");

  const hasContext = chunkContext?.previousChunk || chunkContext?.nextChunk;

  return (
    <div data-testid="source-sheet" className="flex flex-col gap-4 overflow-y-auto px-4 pb-4">
      {/* Header info */}
      <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-2.5 text-sm text-muted-foreground">
        <FileText className="size-4 shrink-0 text-primary/50" />
        <span className="truncate font-medium">{locationLabel}</span>
        <span className="ml-auto shrink-0 rounded-md bg-background px-1.5 py-0.5 font-mono text-[11px] ring-1 ring-border/60">
          #{chunkIndex + 1}
        </span>
      </div>

      {/* Loading state */}
      {!chunkContext && isOpen && (
        <div className="flex flex-col items-center justify-center gap-2 py-12">
          <Loader2 className="size-5 animate-spin text-primary/60" />
          <span className="text-xs text-muted-foreground">Loading context...</span>
        </div>
      )}

      {/* Chunk context with timeline */}
      {chunkContext && (
        <div className="relative pl-7">
          {/* Timeline vertical line */}
          {hasContext && <div className="absolute left-[9px] top-4 bottom-4 w-px bg-border/60" />}

          {/* Previous chunk */}
          {chunkContext.previousChunk && (
            <div className="relative mb-4">
              <div className="absolute -left-7 top-[13px] flex w-[19px] items-center justify-center">
                <div className="size-1.5 rounded-full bg-muted-foreground/25" />
              </div>
              <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/40">
                Previous
              </span>
              <div className="rounded-lg border border-border/30 bg-muted/20 p-3">
                <div className="prose prose-sm prose-neutral dark:prose-invert max-w-none leading-relaxed text-muted-foreground/60 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                  <Markdown>{chunkContext.previousChunk.content}</Markdown>
                </div>
              </div>
            </div>
          )}

          {/* Source chunk (highlighted) */}
          <div className="relative mb-4">
            <div className="absolute -left-7 top-[13px] flex w-[19px] items-center justify-center">
              <div className="size-2.5 rounded-full bg-primary ring-[3px] ring-primary/15" />
            </div>
            <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.1em] text-primary/60">
              Source
            </span>
            <div
              className={cn(
                "rounded-lg border border-primary/20 bg-primary/[0.04] p-3",
                "ring-1 ring-primary/10",
              )}
            >
              <div className="prose prose-sm prose-neutral dark:prose-invert max-w-none leading-relaxed [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                <Markdown>{chunkContext.chunk.content}</Markdown>
              </div>
            </div>
          </div>

          {/* Next chunk */}
          {chunkContext.nextChunk && (
            <div className="relative">
              <div className="absolute -left-7 top-[13px] flex w-[19px] items-center justify-center">
                <div className="size-1.5 rounded-full bg-muted-foreground/25" />
              </div>
              <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/40">
                Next
              </span>
              <div className="rounded-lg border border-border/30 bg-muted/20 p-3">
                <div className="prose prose-sm prose-neutral dark:prose-invert max-w-none leading-relaxed text-muted-foreground/60 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                  <Markdown>{chunkContext.nextChunk.content}</Markdown>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
