import { convexQuery } from "@convex-dev/react-query";
import { api } from "@scrollect/backend/convex/_generated/api";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { usePaginatedQuery } from "convex/react";
import { formatDistanceToNow } from "date-fns";
import { FileText, Loader2, Upload } from "lucide-react";
import { usePostHog } from "posthog-js/react";
import { useCallback, useMemo } from "react";

import { StatusBadge, fileTypeIcons } from "@/components/document-status";
import {
  ProcessingProgressBar,
  isProcessingStatus,
} from "@/components/documents/processing-progress";
import { TagFilterBar, TagList, buildTagMap } from "@/components/tags";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";

type LibrarySearch = {
  tags?: string[];
};

export const Route = createFileRoute("/_authenticated/app/library/")({
  ssr: false,
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(convexQuery(api.tags.listUserTags, {}));
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
  const {
    results: documents,
    status,
    loadMore,
  } = usePaginatedQuery(api.documents.list, {}, { initialNumItems: 20 });

  const sentinelRef = useInfiniteScroll(status, loadMore);

  const posthog = usePostHog();
  const { tags: tagsParam } = Route.useSearch();
  const navigate = Route.useNavigate();
  const selectedTags = useMemo(() => new Set(tagsParam ?? []), [tagsParam]);

  const documentIdsKey = documents.map((d) => d._id).join(",");
  const documentIds = useMemo(
    () => documents.map((d) => d._id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [documentIdsKey],
  );

  const { data: allUserTags } = useQuery(convexQuery(api.tags.listUserTags, {}));
  const { data: tagsBatch } = useQuery(convexQuery(api.tags.getDocumentTagsBatch, { documentIds }));

  const tagOptions = allUserTags ?? [];

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
      posthog.capture("library.tag_filtered", {
        action: selectedTags.has(tagName) ? "removed" : "added",
      });
      navigate({
        search: (prev) => {
          const current = new Set(prev.tags ?? []);
          if (current.has(tagName)) current.delete(tagName);
          else current.add(tagName);
          const tags = [...current];
          return { ...prev, tags: tags.length > 0 ? tags : undefined };
        },
      });
    },
    [navigate, posthog, selectedTags],
  );

  const handleClearTags = useCallback(() => {
    navigate({ search: (prev) => ({ ...prev, tags: undefined }) });
  }, [navigate]);

  const hasDocuments = documents.length > 0;

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8 md:px-6">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My Library</h1>
          <p className="mt-1 text-muted-foreground">
            Your uploaded documents and their processing status.
          </p>
        </div>
        {hasDocuments && (
          <Button size="sm" variant="outline" render={<Link to="/app/upload" />}>
            <Upload className="size-4" />
            Upload
          </Button>
        )}
      </div>

      {status === "LoadingFirstPage" ? (
        <div className="grid gap-3">
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-28 w-full rounded-xl" />
        </div>
      ) : !hasDocuments ? (
        <div className="mt-8 flex flex-col items-center gap-4 text-center">
          <div className="flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/10">
            <FileText className="size-8 text-primary/70" />
          </div>
          <div>
            <p className="text-lg font-semibold">No documents yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Upload your first file to get started.
            </p>
          </div>
          <Button render={<Link to="/app/upload" />}>
            <Upload className="size-4" />
            Upload your first file
          </Button>
        </div>
      ) : (
        <>
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
            {filteredDocuments.map((doc) => {
              const docTags = docTagMap.get(doc._id) ?? [];
              return (
                <Link
                  key={doc._id}
                  to="/app/library/$documentId"
                  params={{ documentId: doc._id }}
                  className="block"
                >
                  <Card className="transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md hover:shadow-primary/5">
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2.5 text-base">
                        {fileTypeIcons[doc.fileType] ?? (
                          <FileText className="size-4 text-muted-foreground" />
                        )}
                        <span className="truncate">{doc.title}</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center gap-3">
                        <StatusBadge status={doc.status} />
                        {isProcessingStatus(doc.status) && (
                          <ProcessingProgressBar status={doc.status} />
                        )}
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
                {status === "Exhausted"
                  ? "No documents match the selected tags."
                  : "No matches yet — loading more documents…"}
              </div>
            )}
          </div>

          <div ref={sentinelRef} className="h-1" />

          {status === "LoadingMore" && (
            <div className="flex justify-center py-4 animate-in fade-in duration-300">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {status === "Exhausted" && filteredDocuments.length > 0 && (
            <div className="flex flex-col items-center gap-3 py-10 text-center text-muted-foreground">
              <div className="h-px w-16 bg-gradient-to-r from-transparent via-border to-transparent" />
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em]">End of library</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
