import { convexQuery } from "@convex-dev/react-query";
import { api } from "@scrollect/backend/convex/_generated/api";
import type { Doc, Id } from "@scrollect/backend/convex/_generated/dataModel";
import { useSuspenseQuery, useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { FileText, Upload } from "lucide-react";
import { useCallback, useMemo } from "react";

import { StatusBadge, fileTypeIcons } from "@/components/document-status";
import { TagFilterBar, TagList, buildTagMap } from "@/components/tags";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type LibrarySearch = {
  tags?: string[];
};

export const Route = createFileRoute("/_authenticated/library/")({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(convexQuery(api.documents.list, {})),
      context.queryClient.ensureQueryData(convexQuery(api.tags.listUserTags, {})),
    ]);
  },
  head: () => ({
    meta: [{ title: "Library | Scrollect" }],
  }),
  validateSearch: (search: Record<string, unknown>): LibrarySearch => {
    const raw = search.tags;
    if (Array.isArray(raw)) {
      const tags = [...new Set(raw.filter((t): t is string => typeof t === "string"))];
      return tags.length > 0 ? { tags } : {};
    }
    if (typeof raw === "string" && raw.length > 0) {
      return { tags: [raw] };
    }
    return {};
  },
  component: LibraryPage,
});

function LibraryPage() {
  const { data: documents } = useSuspenseQuery(convexQuery(api.documents.list, {}));

  return <LibraryContent documents={documents} />;
}

function LibraryContent({ documents }: { documents: Doc<"documents">[] }) {
  const { tags: tagsParam } = Route.useSearch();
  const navigate = Route.useNavigate();
  const selectedTags = useMemo(() => new Set(tagsParam ?? []), [tagsParam]);

  const documentIds = useMemo(() => documents.map((d) => d._id as Id<"documents">), [documents]);

  const { data: allUserTags } = useQuery(convexQuery(api.tags.listUserTags, {}));
  const { data: tagsBatch } = useQuery(convexQuery(api.tags.getDocumentTagsBatch, { documentIds }));

  const tagOptions = useMemo(
    () => (allUserTags ?? []).map((t) => ({ _id: t._id, name: t.name })),
    [allUserTags],
  );

  const docTagMap = useMemo(() => buildTagMap(tagsBatch), [tagsBatch]);

  const filteredDocuments = useMemo(() => {
    if (selectedTags.size === 0) return documents;
    return documents.filter((doc) => {
      const docTags = docTagMap.get(doc._id) ?? [];
      const docTagNames = new Set(docTags.map((t) => t.tagName));
      return [...selectedTags].every((name) => docTagNames.has(name));
    });
  }, [documents, selectedTags, docTagMap]);

  const handleToggleTag = useCallback(
    (tagName: string) => {
      navigate({
        search: (prev) => {
          const current = new Set((prev as LibrarySearch).tags ?? []);
          if (current.has(tagName)) current.delete(tagName);
          else current.add(tagName);
          const tags = [...current];
          return { ...prev, tags: tags.length > 0 ? tags : undefined };
        },
      });
    },
    [navigate],
  );

  const handleClearTags = useCallback(() => {
    navigate({ search: (prev) => ({ ...prev, tags: undefined }) });
  }, [navigate]);

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
            onClear={handleClearTags}
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
