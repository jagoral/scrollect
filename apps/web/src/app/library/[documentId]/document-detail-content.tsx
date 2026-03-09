"use client";

import { api } from "@scrollect/backend/convex/_generated/api";
import type { Preloaded } from "convex/react";
import { usePreloadedQuery } from "convex/react";
import { formatDistanceToNow } from "date-fns";
import { ArrowLeft, FileText, Loader2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";

import { StatusBadge, fileTypeIcons } from "@/components/document-status";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function DocumentDetailContent({
  preloadedDocument,
  preloadedChunks,
  highlightChunkIndex,
}: {
  preloadedDocument: Preloaded<typeof api.documents.get>;
  preloadedChunks: Preloaded<typeof api.chunks.listByDocument>;
  highlightChunkIndex?: number | null;
}) {
  const document = usePreloadedQuery(preloadedDocument);
  const chunks = usePreloadedQuery(preloadedChunks);
  const highlightRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (highlightChunkIndex != null && highlightRef.current) {
      // Small delay to ensure the DOM has rendered
      const timeout = setTimeout(() => {
        highlightRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 100);
      return () => clearTimeout(timeout);
    }
  }, [highlightChunkIndex]);

  if (document === null) {
    return (
      <div className="container mx-auto max-w-3xl px-4 py-8 md:px-6">
        <Link
          href="/library"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Library
        </Link>
        <div className="mt-16 flex flex-col items-center gap-4 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
            <FileText className="h-8 w-8 text-muted-foreground" />
          </div>
          <div>
            <p className="text-lg font-semibold">Document not found</p>
            <p className="mt-1 text-sm text-muted-foreground">
              This document doesn&apos;t exist or you don&apos;t have access to it.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const sortedChunks = [...chunks].sort((a, b) => a.chunkIndex - b.chunkIndex);

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8 md:px-6">
      <Link
        href="/library"
        className="group inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
        Back to Library
      </Link>

      <div className="mt-6">
        <h1 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight">
          <span className="text-muted-foreground">
            {fileTypeIcons[document.fileType] ?? <FileText className="h-5 w-5" />}
          </span>
          <span>{document.title}</span>
        </h1>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <StatusBadge status={document.status} />
          <span className="text-sm text-muted-foreground">{document.fileType.toUpperCase()}</span>
          <span className="text-sm text-muted-foreground">
            {formatDistanceToNow(document.createdAt, { addSuffix: true })}
          </span>
          {document.status === "ready" && (
            <span className="text-sm text-muted-foreground">
              {document.chunkCount} chunk{document.chunkCount !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>

      {document.status === "error" && document.errorMessage && (
        <div className="mt-6 rounded-lg border border-destructive/20 border-l-4 border-l-destructive bg-destructive/5 p-4 text-sm text-destructive">
          {document.errorMessage}
        </div>
      )}

      {(document.status === "parsing" ||
        document.status === "chunking" ||
        document.status === "embedding") && (
        <div className="mt-10 flex flex-col items-center gap-3 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Processing your document...</p>
        </div>
      )}

      {document.status === "uploaded" && (
        <div className="mt-10 flex flex-col items-center gap-3 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
          <p className="text-muted-foreground">Waiting for processing...</p>
        </div>
      )}

      {sortedChunks.length > 0 && (
        <div className="animate-stagger-in mt-8 space-y-3">
          {sortedChunks.map((chunk) => {
            const isHighlighted = highlightChunkIndex === chunk.chunkIndex;
            return (
              <div
                key={chunk._id}
                ref={isHighlighted ? highlightRef : undefined}
                {...(isHighlighted ? { "data-testid": "highlighted-chunk" } : {})}
              >
                <Card
                  data-testid={`chunk-${chunk.chunkIndex}`}
                  className={cn(
                    "overflow-hidden border-l-4 transition-colors",
                    isHighlighted
                      ? "border-l-primary bg-primary/5 ring-1 ring-primary/20"
                      : "border-l-primary/20 hover:border-l-primary/40",
                  )}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-sm font-medium text-muted-foreground">
                        Chunk {chunk.chunkIndex + 1}
                      </span>
                      <div className="flex items-center gap-2">
                        {isHighlighted && (
                          <Badge variant="secondary" className="text-xs">
                            Linked from feed
                          </Badge>
                        )}
                        <span className="text-xs text-muted-foreground">
                          ~{chunk.tokenCount} tokens
                        </span>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">{chunk.content}</p>
                  </CardContent>
                </Card>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
