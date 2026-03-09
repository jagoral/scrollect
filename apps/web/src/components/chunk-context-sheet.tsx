"use client";

import { api } from "@scrollect/backend/convex/_generated/api";
import type { Id } from "@scrollect/backend/convex/_generated/dataModel";
import { useQuery } from "convex/react";
import { FileText, Loader2 } from "lucide-react";

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

  return (
    <div data-testid="source-sheet" className="flex flex-col gap-4 overflow-y-auto px-4 pb-4">
      {/* Header info */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <FileText className="size-4 shrink-0 opacity-60" />
        <span className="truncate">{locationLabel}</span>
        <span className="ml-auto shrink-0 font-mono text-xs">Chunk {chunkIndex + 1}</span>
      </div>

      {/* Loading state */}
      {!chunkContext && isOpen && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Chunk context */}
      {chunkContext && (
        <div className="space-y-3">
          {/* Previous chunk (dimmed context) */}
          {chunkContext.previousChunk && (
            <div className="rounded-lg border border-border/40 bg-muted/30 p-3">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                {chunkContext.previousChunk.content}
              </p>
            </div>
          )}

          {/* Main chunk (highlighted) */}
          <div
            className={cn(
              "rounded-lg border border-primary/30 bg-primary/5 p-3",
              "border-l-4 border-l-primary",
            )}
          >
            <p className="whitespace-pre-wrap text-sm leading-relaxed">
              {chunkContext.chunk.content}
            </p>
          </div>

          {/* Next chunk (dimmed context) */}
          {chunkContext.nextChunk && (
            <div className="rounded-lg border border-border/40 bg-muted/30 p-3">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                {chunkContext.nextChunk.content}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
