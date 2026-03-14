import { Link, createFileRoute } from "@tanstack/react-router";
import { api } from "@scrollect/backend/convex/_generated/api";
import type { Doc, Id } from "@scrollect/backend/convex/_generated/dataModel";
import { useQuery } from "convex/react";
import { formatDistanceToNow } from "date-fns";
import { FileText, Upload } from "lucide-react";
import { useMemo, useState } from "react";

import { StatusBadge, fileTypeIcons } from "@/components/document-status";
import { TagFilterBar, TagList } from "@/components/tags";
import type { DocumentTag } from "@/components/tags";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/library/")({
  head: () => ({
    meta: [{ title: "Library | Scrollect" }],
  }),
  component: LibraryPage,
});

function LibraryPage() {
  const documents = useQuery(api.documents.list);

  if (documents === undefined) {
    return <LibraryLoading />;
  }

  return <LibraryContent documents={documents} />;
}

function LibraryLoading() {
  return (
    <div className="container mx-auto max-w-3xl px-4 py-8 md:px-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">My Library</h1>
        <p className="mt-1 text-muted-foreground">
          Your uploaded documents and their processing status.
        </p>
      </div>
      <div className="animate-stagger-in grid gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-xl border p-4">
            <div className="flex items-center gap-2.5">
              <Skeleton className="h-4 w-4" />
              <Skeleton className="h-5 w-48" />
            </div>
            <div className="mt-3 flex items-center gap-3">
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-4 w-16" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LibraryContent({ documents }: { documents: Doc<"documents">[] }) {
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());

  const documentIds = useMemo(() => documents.map((d) => d._id as Id<"documents">), [documents]);

  const allUserTags = useQuery(api.tags.listUserTags);
  const tagsBatch = useQuery(api.tags.getDocumentTagsBatch, { documentIds });

  const tagOptions = useMemo(
    () => (allUserTags ?? []).map((t) => ({ _id: t._id, name: t.name })),
    [allUserTags],
  );

  const docTagMap = useMemo(() => {
    const map = new Map<string, DocumentTag[]>();
    if (!tagsBatch) return map;
    for (const [docId, raw] of Object.entries(tagsBatch)) {
      map.set(
        docId,
        raw.map((t) => ({ tagId: t._id, tagName: t.name, source: t.source })),
      );
    }
    return map;
  }, [tagsBatch]);

  const filteredDocuments = useMemo(() => {
    if (selectedTags.size === 0) return documents;
    return documents.filter((doc) => {
      const docTags = docTagMap.get(doc._id) ?? [];
      const docTagNames = new Set(docTags.map((t) => t.tagName));
      return [...selectedTags].every((name) => docTagNames.has(name));
    });
  }, [documents, selectedTags, docTagMap]);

  const handleToggleTag = (tagName: string) => {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(tagName)) {
        next.delete(tagName);
      } else {
        next.add(tagName);
      }
      return next;
    });
  };

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
          <Button render={<Link to="/upload" />}>
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
        <Button size="sm" variant="outline" render={<Link to="/upload" />}>
          <Upload className="mr-1.5 h-4 w-4" />
          Upload
        </Button>
      </div>
      {tagOptions.length > 0 && (
        <div className="mb-6">
          <TagFilterBar
            allTags={tagOptions}
            selectedTags={selectedTags}
            onToggle={handleToggleTag}
            onClear={() => setSelectedTags(new Set())}
          />
        </div>
      )}
      <div className="animate-stagger-in grid gap-3">
        {filteredDocuments.map((doc: Doc<"documents">) => {
          const docTags = docTagMap.get(doc._id) ?? [];
          return (
            <Link
              key={doc._id}
              to="/library/$documentId"
              params={{ documentId: doc._id }}
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
                  {docTags.length > 0 && (
                    <div className="mt-2">
                      <TagList tags={docTags} maxVisible={2} size="sm" />
                    </div>
                  )}
                </CardContent>
              </Card>
            </Link>
          );
        })}
        {filteredDocuments.length === 0 && selectedTags.size > 0 && (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No documents match the selected tags.
          </div>
        )}
      </div>
    </div>
  );
}
