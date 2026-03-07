"use client";

import { api } from "@scrollect/backend/convex/_generated/api";
import type { Id } from "@scrollect/backend/convex/_generated/dataModel";
import { Authenticated, AuthLoading, Unauthenticated, useQuery } from "convex/react";
import { formatDistanceToNow } from "date-fns";
import { ArrowLeft, FileText, Loader2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const statusConfig = {
  uploaded: {
    label: "Uploaded",
    className: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  },
  parsing: {
    label: "Parsing",
    className: "bg-blue-100 text-blue-800 animate-pulse dark:bg-blue-900/30 dark:text-blue-400",
  },
  chunking: {
    label: "Chunking",
    className: "bg-blue-100 text-blue-800 animate-pulse dark:bg-blue-900/30 dark:text-blue-400",
  },
  embedding: {
    label: "Embedding",
    className: "bg-blue-100 text-blue-800 animate-pulse dark:bg-blue-900/30 dark:text-blue-400",
  },
  ready: {
    label: "Ready",
    className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  },
  error: {
    label: "Error",
    className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  },
  pending: {
    label: "Pending",
    className: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  },
  processing: {
    label: "Processing",
    className: "bg-blue-100 text-blue-800 animate-pulse dark:bg-blue-900/30 dark:text-blue-400",
  },
} as const;

const fileTypeIcons: Record<string, string> = {
  pdf: "\u{1F4C4}",
  md: "\u{1F4DD}",
};

function StatusBadge({ status }: { status: keyof typeof statusConfig }) {
  const config = statusConfig[status];
  return (
    <Badge variant="outline" className={config.className}>
      {config.label}
    </Badge>
  );
}

function DocumentDetailContent() {
  const params = useParams<{ documentId: string }>();
  const documentId = params.documentId as Id<"documents">;

  const document = useQuery(api.documents.get, { id: documentId });
  const chunks = useQuery(api.chunks.listByDocument, { documentId });

  if (document === undefined) {
    return (
      <div className="container mx-auto max-w-3xl px-4 py-8 md:px-6">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="mt-6 h-8 w-64" />
        <Skeleton className="mt-3 h-5 w-48" />
        <div className="mt-8 space-y-3">
          <Skeleton className="h-36 w-full rounded-xl" />
          <Skeleton className="h-36 w-full rounded-xl" />
        </div>
      </div>
    );
  }

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

  const sortedChunks = chunks ? [...chunks].sort((a, b) => a.chunkIndex - b.chunkIndex) : undefined;

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8 md:px-6">
      <Link
        href="/library"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Library
      </Link>

      <div className="mt-6">
        <h1 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight">
          <span className="text-2xl">{fileTypeIcons[document.fileType] ?? "\u{1F4C4}"}</span>
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
        <div className="mt-6 rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
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

      {sortedChunks !== undefined && sortedChunks.length > 0 && (
        <div className="mt-8 space-y-3">
          {sortedChunks.map((chunk) => (
            <Card key={chunk._id} className="overflow-hidden border-l-4 border-l-primary/20">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-muted-foreground">
                    Chunk {chunk.chunkIndex + 1}
                  </span>
                  <span className="text-xs text-muted-foreground">~{chunk.tokenCount} tokens</span>
                </div>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{chunk.content}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function UnauthenticatedRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/signin");
  }, [router]);
  return null;
}

export default function DocumentDetailPage() {
  return (
    <>
      <Authenticated>
        <DocumentDetailContent />
      </Authenticated>
      <Unauthenticated>
        <UnauthenticatedRedirect />
      </Unauthenticated>
      <AuthLoading>
        <div className="flex flex-1 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
        </div>
      </AuthLoading>
    </>
  );
}
