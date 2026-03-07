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
  pending: {
    label: "Pending",
    className: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  },
  processing: {
    label: "Processing",
    className: "bg-blue-100 text-blue-800 animate-pulse dark:bg-blue-900/30 dark:text-blue-400",
  },
  ready: {
    label: "Ready",
    className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  },
  error: {
    label: "Error",
    className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
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
        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-5" />
          <Skeleton className="h-5 w-40" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-3">
          <Skeleton className="h-5 w-20" />
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
      <div className="container mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-2xl font-bold">My Library</h1>
        <p className="mt-2 text-muted-foreground">
          Your uploaded documents and their processing status.
        </p>
        <div className="mt-6 grid gap-3">
          <DocumentCardSkeleton />
          <DocumentCardSkeleton />
          <DocumentCardSkeleton />
        </div>
      </div>
    );
  }

  if (documents.length === 0) {
    return (
      <div className="container mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-2xl font-bold">My Library</h1>
        <div className="mt-12 flex flex-col items-center gap-4 text-center">
          <FileText className="h-12 w-12 text-muted-foreground/50" />
          <div>
            <p className="text-lg font-medium">No documents yet</p>
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
    <div className="container mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold">My Library</h1>
      <p className="mt-2 text-muted-foreground">
        Your uploaded documents and their processing status.
      </p>
      <div className="mt-6 grid gap-3">
        {documents.map((doc: Doc<"documents">) => (
          <Link
            key={doc._id}
            href={`/library/${doc._id}` as `/library/${string}`}
            className="block"
          >
            <Card className="transition-colors hover:bg-muted/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <span>{fileTypeIcons[doc.fileType] ?? "\u{1F4C4}"}</span>
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
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-foreground" />
        </div>
      </AuthLoading>
    </>
  );
}
