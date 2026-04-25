import { convexQuery } from "@convex-dev/react-query";
import { api } from "@scrollect/backend/convex/_generated/api";
import type { Id } from "@scrollect/backend/convex/_generated/dataModel";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { format, formatDistanceToNow } from "date-fns";
import { ExternalLink, Loader2, MousePointerClick, Rss, Trash2, X } from "lucide-react";
import { usePostHog } from "posthog-js/react";
import { createContext, useCallback, useContext, useState } from "react";
import { toast } from "sonner";

import { StatusBadge, statusConfig } from "@/components/document-status";
import { DetailRail, DetailRailPlaceholder, DETAIL_RULED_BG_STYLE } from "@/components/detail-rail";
import { BookmarkedPostsSection } from "@/components/documents/bookmarked-posts-section";
import { DocumentThumb, FileTypeIcon } from "@/components/documents/document-thumb";
import { HighlightsSection } from "@/components/documents/highlights-section";
import { ImportHighlightsDialog } from "@/components/documents/import-highlights-dialog";
import { LearningGoalSection } from "@/components/documents/learning-goal-section";
import { PipelineError } from "@/components/documents/pipeline-error";
import { ProcessingProgress, isProcessingStatus } from "@/components/documents/processing-progress";
import { TopicAssignmentSection } from "@/components/library/topic-assignment-section";
import { DocumentTagSection } from "@/components/tags/document-tag-section";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

type LibraryDetailContextValue = {
  selectedDocumentId: Id<"documents"> | null;
  openDetail: (id: Id<"documents">) => void;
  closeDetail: () => void;
};

const LibraryDetailContext = createContext<LibraryDetailContextValue | null>(null);

export function useLibraryDetail() {
  return useContext(LibraryDetailContext);
}

export function LibraryDetailProvider({ children }: { children: React.ReactNode }) {
  const [selectedDocumentId, setSelectedDocumentId] = useState<Id<"documents"> | null>(null);

  const openDetail = useCallback((id: Id<"documents">) => {
    setSelectedDocumentId(id);
  }, []);

  const closeDetail = useCallback(() => {
    setSelectedDocumentId(null);
  }, []);

  return (
    <LibraryDetailContext.Provider value={{ selectedDocumentId, openDetail, closeDetail }}>
      {children}
    </LibraryDetailContext.Provider>
  );
}

export function LibraryDetailPanel() {
  const ctx = useLibraryDetail();
  const isMobile = useIsMobile();
  if (!ctx) return null;
  const { selectedDocumentId, closeDetail } = ctx;

  if (!selectedDocumentId) {
    if (isMobile) return null;

    return (
      <DetailRail testId="library-detail-panel">
        <DetailRailPlaceholder
          icon={MousePointerClick}
          title="Select a document"
          description="Click any document in your archive to open its file card here."
        />
      </DetailRail>
    );
  }

  if (isMobile) {
    return (
      <Sheet open onOpenChange={closeDetail}>
        <SheetContent
          side="bottom"
          showCloseButton={false}
          className="max-h-[85dvh] overflow-y-auto rounded-t-2xl px-0 pb-[env(safe-area-inset-bottom)]"
        >
          <div className="mx-auto mb-1 mt-0 h-1 w-10 shrink-0 rounded-full bg-muted-foreground/25" />
          <SheetTitle className="sr-only">Document details</SheetTitle>
          <SheetDescription className="sr-only">Document information and content.</SheetDescription>
          <div key={selectedDocumentId} className="animate-in fade-in duration-200">
            <DocumentDetailContent documentId={selectedDocumentId} onClose={closeDetail} />
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <DetailRail testId="library-detail-panel">
      <div className="h-full overflow-y-auto overscroll-contain">
        <div
          key={selectedDocumentId}
          className="animate-in fade-in slide-in-from-top-2 duration-200"
        >
          <DocumentDetailContent documentId={selectedDocumentId} onClose={closeDetail} />
        </div>
      </div>
    </DetailRail>
  );
}

const KIND_LABELS: Record<string, string> = {
  pdf: "PDF",
  epub: "Book",
  md: "Markdown",
  markdown: "Markdown",
  txt: "Note",
  text: "Note",
  html: "Article",
  article: "Article",
  url: "Article",
  youtube: "Video",
};

function kindLabel(fileType: string): string {
  return KIND_LABELS[fileType.toLowerCase()] ?? fileType.toUpperCase();
}

function DocumentDetailContent({
  documentId,
  onClose,
}: {
  documentId: Id<"documents">;
  onClose: () => void;
}) {
  const { data: document } = useQuery(convexQuery(api.content.documents.get, { id: documentId }));
  const deleteDocument = useAction(api.content.documentActions.deleteDocument);
  const posthog = usePostHog();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    if (!document) return;
    setIsDeleting(true);
    try {
      await deleteDocument({ documentId: document._id });
      posthog.capture("document.deleted", { file_type: document.fileType });
      setDeleteDialogOpen(false);
      toast.success("Document deleted");
      onClose();
    } catch (error) {
      posthog.captureException(error);
      toast.error("Failed to delete document");
      setIsDeleting(false);
    }
  };

  if (document === undefined) {
    return (
      <div className="flex h-full min-w-0 flex-col">
        <div className="flex items-center justify-between border-b border-dashed border-border px-6 py-4 md:px-7">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="size-8" />
        </div>
        <div className="px-6 py-7 md:px-8">
          <Skeleton className="aspect-[16/9] w-full" />
          <Skeleton className="mt-6 h-7 w-3/4" />
          <Skeleton className="mt-3 h-3 w-1/2" />
        </div>
      </div>
    );
  }

  if (!document) {
    return (
      <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
        <p className="text-sm text-muted-foreground">Document not found.</p>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Close
        </Button>
      </div>
    );
  }

  const statusAccent = statusConfig[document.status].dotClassName;
  const hostname = document.sourceUrl ? safeHostname(document.sourceUrl) : null;

  return (
    <div className="flex h-full min-w-0 flex-col">
      <div className="flex items-center justify-between border-b border-dashed border-border px-6 py-4 md:px-7">
        <div className="flex min-w-0 items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.16em] text-muted-foreground">
          <span>Volume</span>
          <span className="text-foreground/30">&middot;</span>
          <span className="font-medium text-foreground">{kindLabel(document.fileType)}</span>
          <span className="text-foreground/30">&middot;</span>
          <span className="truncate">
            {format(document.createdAt, "MMM d, yyyy").toUpperCase()}
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 shrink-0 rounded-none"
          onClick={onClose}
        >
          <X className="size-3.5" />
          <span className="sr-only">Close</span>
        </Button>
      </div>

      <div
        className="flex min-w-0 flex-1 flex-col gap-6 overflow-y-auto px-6 py-7 md:px-8"
        style={DETAIL_RULED_BG_STYLE}
      >
        <div className="flex min-w-0 flex-col gap-5">
          <figure
            className={cn(
              "relative aspect-[16/9] w-full overflow-hidden border border-border",
              "bg-muted/30 shadow-[0_1px_0_0_rgba(0,0,0,0.04)]",
            )}
          >
            {document.thumbnailUrl ? (
              <img
                src={document.thumbnailUrl}
                alt=""
                loading="lazy"
                className="absolute inset-0 size-full object-cover"
              />
            ) : (
              <DocumentThumb
                documentId={document._id}
                title={document.title}
                fileType={document.fileType}
                variant="hero"
                className="absolute inset-0"
              />
            )}
            <div aria-hidden className={cn("absolute inset-x-0 bottom-0 h-[3px]", statusAccent)} />
            <div className="absolute left-4 top-4">
              <span className="inline-flex items-center gap-1.5 border border-border/80 bg-background/80 px-2 py-[3px] font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground backdrop-blur">
                <FileTypeIcon fileType={document.fileType} className="size-3" />
                {kindLabel(document.fileType)}
              </span>
            </div>
          </figure>

          <div className="flex items-center justify-between gap-3">
            <StatusBadge status={document.status} />
            {hostname && (
              <a
                href={document.sourceUrl!}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-w-0 items-center gap-1 font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-foreground"
              >
                <ExternalLink className="size-3 shrink-0" />
                <span className="truncate normal-case tracking-normal text-[12px]">{hostname}</span>
              </a>
            )}
          </div>

          <h2
            data-testid="library-detail-title"
            className="font-logo text-[1.65rem] font-semibold leading-[1.15] tracking-tight text-foreground md:text-[1.85rem]"
          >
            {document.title}
          </h2>

          <dl className="flex flex-wrap items-center gap-x-3 gap-y-1.5 font-mono text-[10.5px] uppercase tracking-[0.16em] text-muted-foreground">
            {document.status === "ready" && (
              <>
                <div className="flex items-center gap-1.5">
                  <dt className="sr-only">Chunks</dt>
                  <dd className="tabular-nums text-foreground/70">
                    {document.chunkCount.toLocaleString()}
                  </dd>
                  <span>Chunk{document.chunkCount !== 1 ? "s" : ""}</span>
                </div>
                <span aria-hidden className="text-foreground/20">
                  &middot;
                </span>
              </>
            )}
            <div className="flex items-center gap-1.5">
              <dt className="sr-only">Added</dt>
              <span>Added</span>
              <dd className="normal-case tracking-normal text-foreground/70">
                {formatDistanceToNow(document.createdAt, { addSuffix: true })}
              </dd>
            </div>
          </dl>
        </div>

        <div className="flex flex-wrap items-center gap-1 border-y border-dashed border-border py-2">
          <Button
            variant="ghost"
            size="sm"
            className="rounded-none"
            render={<Link to="/app/feed" search={{ documentId: document._id }} />}
          >
            <Rss data-icon="inline-start" />
            Open in feed
          </Button>
          {document.status === "ready" && (
            <>
              <span aria-hidden className="mx-1 h-4 w-px bg-border" />
              <ImportHighlightsDialog documentId={document._id} />
            </>
          )}
          <span className="ml-auto" />
          <AlertDialog
            open={deleteDialogOpen}
            onOpenChange={(open) => {
              if (!isDeleting) setDeleteDialogOpen(open);
            }}
          >
            <AlertDialogTrigger
              render={
                <Button
                  variant="ghost"
                  size="sm"
                  className="rounded-none text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  data-testid="delete-document-button"
                />
              }
            >
              <Trash2 data-icon="inline-start" />
              Delete
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete document</AlertDialogTitle>
                <AlertDialogDescription>
                  Delete &ldquo;{document.title}&rdquo;? This will remove the document and all
                  generated posts. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isDeleting} data-testid="cancel-delete-button">
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  disabled={isDeleting}
                  onClick={handleDelete}
                  data-testid="confirm-delete-button"
                >
                  {isDeleting && <Loader2 className="animate-spin" data-icon="inline-start" />}
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        {(document.status === "ready" || document.learningGoalOnboardingStatus === "pending") && (
          <div className="flex flex-col">
            {document.status === "ready" && <DocumentTagSection documentId={document._id} />}
            {document.status === "ready" && <TopicAssignmentSection documentId={document._id} />}
            <LearningGoalSection
              documentId={document._id}
              initialGoal={document.learningGoal}
              onboardingStatus={document.learningGoalOnboardingStatus}
              sourceType={document.fileType}
            />
            {document.status === "ready" && <HighlightsSection documentId={document._id} />}
            {document.status === "ready" && <BookmarkedPostsSection documentId={document._id} />}
          </div>
        )}

        {document.status === "error" && (
          <PipelineError
            documentId={document._id}
            errorMessage={document.errorMessage}
            failedAt={document.failedAt}
          />
        )}

        {isProcessingStatus(document.status) && <ProcessingProgress status={document.status} />}

        {document.status === "deleting" && (
          <div className="mt-4 flex flex-col items-center gap-4 text-center" role="status">
            <div className="flex size-12 items-center justify-center border border-destructive/30 bg-transparent">
              <Loader2 className="size-5 animate-spin text-destructive" aria-hidden="true" />
            </div>
            <p className="text-sm text-muted-foreground">Deleting document...</p>
          </div>
        )}
      </div>
    </div>
  );
}

function safeHostname(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}
