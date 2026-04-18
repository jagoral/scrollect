import { convexQuery } from "@convex-dev/react-query";
import { api } from "@scrollect/backend/convex/_generated/api";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { usePaginatedQuery } from "convex/react";
import { formatDistanceToNow } from "date-fns";
import { FileText, Globe, Loader2, Upload } from "lucide-react";
import { usePostHog } from "posthog-js/react";

import { DocumentUsageMeter } from "@/components/billing/document-usage-meter";
import { UpgradeDialog } from "@/components/billing/upgrade-dialog";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";
import { StatusBadge, fileTypeIcons } from "@/components/document-status";
import {
  ProcessingProgressBar,
  isProcessingStatus,
} from "@/components/documents/processing-progress";
import { useLibraryDetail } from "@/components/library-detail-panel";
import { TagFilterBar, TagList, buildTagMap } from "@/components/tags";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";
import { useCallback, useMemo, useState } from "react";

type LibrarySearch = {
  tags?: string[];
};

export const Route = createFileRoute("/_authenticated/app/library/")({
  ssr: false,
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
  const libraryDetail = useLibraryDetail();

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
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const { data: userProfile } = useQuery(convexQuery(api.entitlements.getUserProfile, {}));
  const onboardingActive = userProfile ? !userProfile.onboardingCompleted : false;

  return (
    <div className="py-6">
      <div className="mb-6 flex flex-col gap-4 px-4 md:px-6 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My Library</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your uploaded documents and their processing status.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <DocumentUsageMeter onUpgradeClick={() => setUpgradeOpen(true)} />
          {hasDocuments && (
            <Button size="sm" variant="outline" render={<Link to="/app/upload" />}>
              <Upload className="size-4" />
              Upload
            </Button>
          )}
        </div>
      </div>
      <UpgradeDialog open={upgradeOpen} onOpenChange={setUpgradeOpen} source="library_header" />

      <OnboardingWizard documents={documents} />

      {status === "LoadingFirstPage" ? (
        <div className="border-y border-r border-border">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="border-l-[2px] border-l-muted border-t border-border first:border-t-0 px-6 py-5"
            >
              <Skeleton className="h-4 w-48" />
              <Skeleton className="mt-3 h-3 w-32" />
            </div>
          ))}
        </div>
      ) : !hasDocuments ? (
        onboardingActive ? null : (
          <div className="mt-8 flex flex-col items-center gap-4 text-center">
            <div className="flex size-16 items-center justify-center border border-primary/30 bg-transparent">
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
        )
      ) : (
        <>
          {tagOptions.length > 0 && (
            <div className="mb-6 px-4 md:px-6">
              <TagFilterBar
                allTags={tagOptions}
                selectedTags={selectedTags}
                onToggle={handleToggleTag}
                onClear={handleClearTags}
              />
            </div>
          )}
          <div className="animate-stagger-in">
            <div className="border-y border-border">
              {filteredDocuments.map((doc) => {
                const docTags = docTagMap.get(doc._id) ?? [];
                const statusColor =
                  doc.status === "ready"
                    ? "border-l-emerald-500"
                    : doc.status === "error"
                      ? "border-l-red-500"
                      : "border-l-primary";

                const isSelected = libraryDetail?.selectedDocumentId === doc._id;

                return (
                  <button
                    type="button"
                    key={doc._id}
                    data-testid="document-item"
                    onClick={() => {
                      if (libraryDetail) {
                        libraryDetail.openDetail(doc._id);
                      } else {
                        navigate({
                          to: "/app/library/$documentId",
                          params: { documentId: doc._id },
                        });
                      }
                    }}
                    className={cn(
                      "block w-full cursor-pointer border-l-[2px] border-t border-border first:border-t-0 bg-card text-left transition-colors hover:bg-accent/30",
                      isSelected ? "bg-accent/30" : "",
                      statusColor,
                    )}
                  >
                    <div className="grid grid-cols-[1fr_6rem] sm:grid-cols-[1fr_8rem]">
                      <div className="min-w-0 px-6 py-4">
                        <div className="flex items-start gap-2.5">
                          <span className="mt-0.5 shrink-0">
                            {fileTypeIcons[doc.fileType] ?? (
                              <FileText className="size-4 text-muted-foreground" />
                            )}
                          </span>
                          <span className="line-clamp-2 text-sm font-semibold">{doc.title}</span>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-3">
                          <StatusBadge status={doc.status} />
                          {isProcessingStatus(doc.status) && (
                            <ProcessingProgressBar status={doc.status} />
                          )}
                          {doc.status === "ready" && (
                            <span className="text-xs text-muted-foreground">
                              {doc.chunkCount} chunk{doc.chunkCount !== 1 ? "s" : ""}
                            </span>
                          )}
                          {doc.sourceUrl && (
                            <Globe
                              className="size-3 text-muted-foreground"
                              aria-label="Added from URL"
                            />
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
                      </div>
                      <div className="relative border-l border-border bg-transparent">
                        {doc.thumbnailUrl && (
                          <img
                            src={doc.thumbnailUrl}
                            alt=""
                            loading="lazy"
                            className="absolute inset-0 size-full object-cover"
                          />
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
              {filteredDocuments.length === 0 && selectedTags.size > 0 && (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  {status === "Exhausted"
                    ? "No documents match the selected tags."
                    : "No matches yet - loading more documents..."}
                </div>
              )}
            </div>
          </div>

          <div ref={sentinelRef} className="h-1" />

          {status === "LoadingMore" && (
            <div className="flex justify-center py-4 animate-in fade-in duration-300">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {status === "Exhausted" && filteredDocuments.length > 0 && (
            <div className="flex flex-col items-center gap-3 py-10 text-center text-muted-foreground">
              <div className="h-px w-16 bg-border" />
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em]">End of library</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
