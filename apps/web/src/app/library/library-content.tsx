"use client";

import { api } from "@scrollect/backend/convex/_generated/api";
import type { Doc } from "@scrollect/backend/convex/_generated/dataModel";
import type { Preloaded } from "convex/react";
import { usePreloadedQuery } from "convex/react";
import { formatDistanceToNow } from "date-fns";
import { FileText, Upload } from "lucide-react";
import Link from "next/link";

import { StatusBadge, fileTypeIcons } from "@/components/document-status";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function LibraryContent({
  preloadedDocuments,
}: {
  preloadedDocuments: Preloaded<typeof api.documents.list>;
}) {
  const documents = usePreloadedQuery(preloadedDocuments);

  if (documents.length === 0) {
    return (
      <div className="container mx-auto max-w-3xl px-4 py-8 md:px-6">
        <h1 className="text-2xl font-bold tracking-tight">My Library</h1>
        <div className="mt-16 flex flex-col items-center gap-4 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/10">
            <FileText className="h-8 w-8 text-primary/70" />
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
      <div className="animate-stagger-in grid gap-3">
        {documents.map((doc: Doc<"documents">) => (
          <Link
            key={doc._id}
            href={`/library/${doc._id}` as `/library/${string}`}
            className="block"
          >
            <Card className="transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md hover:shadow-primary/5">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2.5 text-base">
                  {fileTypeIcons[doc.fileType] ?? (
                    <FileText className="h-4 w-4 text-muted-foreground" />
                  )}
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
