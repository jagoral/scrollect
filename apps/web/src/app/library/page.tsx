"use client";

import { api } from "@scrollect/backend/convex/_generated/api";
import type { Doc } from "@scrollect/backend/convex/_generated/dataModel";
import { Authenticated, AuthLoading, Unauthenticated, useQuery } from "convex/react";
import { formatDistanceToNow } from "date-fns";
import { FileText, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

function DocumentCardSkeleton() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <Skeleton className="h-5 w-5 rounded" />
          <Skeleton className="h-5 w-40" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-3">
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-4 w-16" />
        </div>
      </CardContent>
    </Card>
  );
}

function LibraryContent() {
  const documents = useQuery(api.documents.list);

  if (documents === undefined) {
    return (
      <div className="container mx-auto max-w-3xl px-4 py-8 md:px-6">
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight">My Library</h1>
          <p className="mt-1 text-muted-foreground">
            Your uploaded documents and their processing status.
          </p>
        </div>
        <div className="grid gap-3">
          <DocumentCardSkeleton />
          <DocumentCardSkeleton />
          <DocumentCardSkeleton />
        </div>
      </div>
    );
  }

  if (documents.length === 0) {
    return (
      <div className="container mx-auto max-w-3xl px-4 py-8 md:px-6">
        <h1 className="text-2xl font-bold tracking-tight">My Library</h1>
        <div className="mt-16 flex flex-col items-center gap-4 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
            <FileText className="h-8 w-8 text-muted-foreground" />
          </div>
          <div>
            <p className="text-lg font-semibold">No documents yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Upload your first file to get started.
            </p>
          </div>
          <Button render={<Link href="/upload" />}>
            <Upload className="mr-2 h-4 w-4" />
            Upload your first file
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8 md:px-6">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My Library</h1>
          <p className="mt-1 text-muted-foreground">
            Your uploaded documents and their processing status.
          </p>
        </div>
        <Button size="sm" variant="outline" render={<Link href="/upload" />}>
          <Upload className="mr-1.5 h-4 w-4" />
          Upload
        </Button>
      </div>
      <div className="grid gap-3">
        {documents.map((doc: Doc<"documents">) => (
          <Link
            key={doc._id}
            href={`/library/${doc._id}` as `/library/${string}`}
            className="block"
          >
            <Card className="transition-all hover:border-primary/30 hover:shadow-sm hover:shadow-primary/5">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2.5 text-base">
                  <span className="text-lg">{fileTypeIcons[doc.fileType] ?? "\u{1F4C4}"}</span>
                  <span className="truncate">{doc.title}</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3">
                  <StatusBadge status={doc.status} />
                  {doc.status === "ready" && (
                    <span className="text-xs text-muted-foreground">
                      {doc.chunkCount} chunk{doc.chunkCount !== 1 ? "s" : ""}
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {formatDistanceToNow(doc.createdAt, { addSuffix: true })}
                  </span>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
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

export default function LibraryPage() {
  return (
    <>
      <Authenticated>
        <LibraryContent />
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
