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
import { PageHeader } from "@/components/page-header";
import { StatusBadge, fileTypeIcons } from "@/components/document-status";
import {
  ProcessingProgressBar,
  isProcessingStatus,
} from "@/components/documents/processing-progress";
import { LibraryRowTopicChip } from "@/components/library/library-row-topic-chip";
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

const KIND_LABELS: Record<string, string> = {
  pdf: "PDF",
  epub: "Book",
  md: "Markdown",
  txt: "Note",
  html: "Article",
  youtube: "Video",
};

function kindLabel(fileType: string): string {
  return KIND_LABELS[fileType] ?? fileType.toUpperCase();
}

function LibraryPage() {
  const {
    results: documents,
    status,
    loadMore,
  } = usePaginatedQuery(api.content.documents.list, {}, { initialNumItems: 20 });

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

  const { data: allUserTags } = useQuery(convexQuery(api.content.tags.listUserTags, {}));
  const { data: tagsBatch } = useQuery(
    convexQuery(api.content.tags.getDocumentTagsBatch, { documentIds }),
  );
  const { data: topicsBatch } = useQuery(
    convexQuery(api.topics.topics.getDocumentTopicsBatch, { documentIds }),
  );

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

  const readyCount = useMemo(
    () => filteredDocuments.filter((d) => d.status === "ready").length,
    [filteredDocuments],
  );

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
  const { data: userProfile } = useQuery(convexQuery(api.access.entitlements.getUserProfile, {}));
  const onboardingActive = userProfile ? !userProfile.onboardingCompleted : false;

  return (
    <div className="pb-10">
      <PageHeader
        eyebrow="The Archive"
        title="My Library"
        description="Everything you've saved, indexed, and made ready to scroll."
        actions={
          <>
            <DocumentUsageMeter onUpgradeClick={() => setUpgradeOpen(true)} />
            {hasDocuments && (
              <Button size="sm" variant="outline" render={<Link to="/app/upload" />}>
                <Upload className="size-4" />
                Upload document
              </Button>
            )}
          </>
        }
      />
      <UpgradeDialog open={upgradeOpen} onOpenChange={setUpgradeOpen} source="library_header" />

      <OnboardingWizard documents={documents} />

      {status === "LoadingFirstPage" ? (
        <div data-testid="library-loading-list">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="relative border-b border-border px-4 py-6 md:px-8">
              <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-muted" aria-hidden />
              <div className="grid grid-cols-[2rem_1fr_5rem] gap-4 md:grid-cols-[2.5rem_1fr_6rem] md:gap-6">
                <Skeleton className="h-3 w-5" />
                <div className="min-w-0">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="mt-3 h-5 w-4/5" />
                  <Skeleton className="mt-4 h-3 w-1/2" />
                </div>
                <Skeleton className="h-24 w-full md:h-28" />
              </div>
            </div>
          ))}
        </div>
      ) : !hasDocuments ? (
        onboardingActive ? null : (
          <div className="mt-16 flex flex-col items-center gap-5 px-6 text-center">
            <div className="flex size-16 items-center justify-center border border-primary/30 bg-transparent">
              <FileText className="size-8 text-primary/70" />
            </div>
            <div>
              <p className="font-logo text-2xl font-semibold tracking-tight">
                Your archive is empty
              </p>
              <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-muted-foreground">
                Upload your first document to start building a personal learning library.
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
            <section className="border-b border-border px-4 pt-5 pb-4 md:px-8">
              <div className="mb-3 flex items-center gap-3">
                <span className="font-mono text-[10px] font-medium uppercase tracking-[0.28em] text-muted-foreground">
                  Filter
                </span>
                <div className="h-px flex-1 bg-border" />
              </div>
              <TagFilterBar
                allTags={tagOptions}
                selectedTags={selectedTags}
                onToggle={handleToggleTag}
                onClear={handleClearTags}
              />
            </section>
          )}

          <div className="flex items-center justify-between gap-4 border-b border-border px-4 py-3 md:px-8">
            <span className="font-mono text-[10.5px] tabular-nums uppercase tracking-[0.22em] text-muted-foreground">
              <span className="text-foreground">
                {String(filteredDocuments.length).padStart(2, "0")}
              </span>
              <span className="text-muted-foreground/60"> / </span>
              {String(documents.length).padStart(2, "0")} Volumes
            </span>
            <span className="font-mono text-[10.5px] tabular-nums uppercase tracking-[0.22em] text-muted-foreground">
              {readyCount} Ready
            </span>
          </div>

          <div className="animate-stagger-in">
            {filteredDocuments.map((doc, index) => {
              const docTags = docTagMap.get(doc._id) ?? [];
              const statusColor =
                doc.status === "ready"
                  ? "bg-emerald-500"
                  : doc.status === "error"
                    ? "bg-red-500"
                    : "bg-primary";

              const isSelected = libraryDetail?.selectedDocumentId === doc._id;

              const openRow = () => {
                if (libraryDetail) {
                  libraryDetail.openDetail(doc._id);
                } else {
                  navigate({
                    to: "/app/library/$documentId",
                    params: { documentId: doc._id },
                  });
                }
              };

              return (
                <div
                  role="button"
                  tabIndex={0}
                  key={doc._id}
                  data-testid="document-item"
                  onClick={openRow}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openRow();
                    }
                  }}
                  className={cn(
                    "group relative block w-full cursor-pointer border-b border-border bg-card text-left transition-all duration-200 outline-none",
                    "hover:bg-accent/30 focus-visible:bg-accent/40 focus-visible:ring-1 focus-visible:ring-ring",
                    isSelected && "bg-accent/40",
                  )}
                >
                  <div
                    aria-hidden
                    className={cn(
                      "absolute left-0 top-0 bottom-0 w-[2px] transition-all",
                      statusColor,
                      "group-hover:w-[3px]",
                      isSelected && "w-[3px]",
                    )}
                  />

                  <div className="grid grid-cols-[2rem_1fr_5rem] gap-4 px-4 py-5 md:grid-cols-[2.5rem_1fr_6rem] md:gap-6 md:px-8 md:py-6">
                    <div className="flex flex-col items-start pt-1">
                      <span className="font-mono text-[10.5px] tabular-nums tracking-[0.18em] text-muted-foreground/50 group-hover:text-muted-foreground">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                    </div>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                        <StatusBadge status={doc.status} />
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <span className="shrink-0 [&_svg]:size-3.5">
                            {fileTypeIcons[doc.fileType] ?? <FileText className="size-3.5" />}
                          </span>
                          <span className="font-mono text-[10px] uppercase tracking-[0.22em]">
                            {kindLabel(doc.fileType)}
                          </span>
                          {doc.sourceUrl && (
                            <Globe
                              className="size-3 text-muted-foreground/70"
                              aria-label="Added from URL"
                            />
                          )}
                        </div>
                        {doc.status === "ready" && (
                          <LibraryRowTopicChip topic={topicsBatch?.[doc._id] ?? null} />
                        )}
                      </div>

                      <h2 className="mt-2.5 font-logo text-lg font-semibold leading-[1.25] tracking-tight text-foreground [&]:line-clamp-2 md:text-[1.35rem]">
                        {doc.title}
                      </h2>

                      <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                        {isProcessingStatus(doc.status) && (
                          <>
                            <ProcessingProgressBar status={doc.status} />
                            <span aria-hidden className="text-muted-foreground/40">
                              ·
                            </span>
                          </>
                        )}
                        {doc.status === "ready" && (
                          <>
                            <span className="tabular-nums">
                              {doc.chunkCount.toLocaleString()} chunk
                              {doc.chunkCount !== 1 ? "s" : ""}
                            </span>
                            <span aria-hidden className="text-muted-foreground/40">
                              ·
                            </span>
                          </>
                        )}
                        <span>added {formatDistanceToNow(doc.createdAt, { addSuffix: true })}</span>
                      </div>

                      {docTags.length > 0 && (
                        <div className="mt-3">
                          <TagList tags={docTags} maxVisible={3} size="sm" />
                        </div>
                      )}
                    </div>

                    <div className="relative h-20 w-full shrink-0 overflow-hidden border border-border bg-muted/40 md:h-28">
                      {doc.thumbnailUrl ? (
                        <img
                          src={doc.thumbnailUrl}
                          alt=""
                          loading="lazy"
                          className="absolute inset-0 size-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
                        />
                      ) : (
                        <div
                          aria-hidden
                          className="flex h-full items-center justify-center text-muted-foreground/30 [&_svg]:size-6"
                        >
                          {fileTypeIcons[doc.fileType] ?? <FileText className="size-6" />}
                        </div>
                      )}
                      <div
                        aria-hidden
                        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
            {filteredDocuments.length === 0 && selectedTags.size > 0 && (
              <div className="px-6 py-12 text-center">
                <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-muted-foreground/60">
                  No matches
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {status === "Exhausted"
                    ? "No documents match the selected tags."
                    : "Loading more documents..."}
                </p>
              </div>
            )}
          </div>

          <div ref={sentinelRef} className="h-1" />

          {status === "LoadingMore" && (
            <div className="flex justify-center py-6 animate-in fade-in duration-300">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {status === "Exhausted" && filteredDocuments.length > 0 && (
            <div className="flex flex-col items-center gap-3 py-12 text-center text-muted-foreground">
              <div className="flex items-center gap-3">
                <div className="h-px w-10 bg-border" />
                <span aria-hidden className="inline-block h-1 w-1 rounded-full bg-primary/60" />
                <div className="h-px w-10 bg-border" />
              </div>
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.28em]">
                End of library
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
