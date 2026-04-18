import { convexQuery } from "@convex-dev/react-query";
import { api } from "@scrollect/backend/convex/_generated/api";
import type { Id } from "@scrollect/backend/convex/_generated/dataModel";
import { useQuery } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { formatDistanceToNow } from "date-fns";
import { FileText, Globe, Loader2, MousePointerClick, Trash2, X } from "lucide-react";
import { usePostHog } from "posthog-js/react";
import { createContext, useCallback, useContext, useState } from "react";
import { toast } from "sonner";

import { fileTypeIcons, StatusBadge } from "@/components/document-status";
import { Badge } from "@/components/ui/badge";
import { BookmarkedCardsSection } from "@/components/documents/bookmarked-cards-section";
import { HighlightsSection } from "@/components/documents/highlights-section";
import { ImportHighlightsDialog } from "@/components/documents/import-highlights-dialog";
import { LearningGoalSection } from "@/components/documents/learning-goal-section";
import { PipelineError } from "@/components/documents/pipeline-error";
import { ProcessingProgress, isProcessingStatus } from "@/components/documents/processing-progress";
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
      <aside className="-ml-px hidden min-w-0 flex-1 border-l border-border lg:block">
        <div className="sticky top-14 flex h-[calc(100svh-3.5rem)] flex-col items-center justify-center px-6 text-center">
          <div className="flex size-12 items-center justify-center border border-border">
            <MousePointerClick className="size-5 text-muted-foreground" />
          </div>
          <p className="mt-4 text-sm font-medium text-foreground">Select a document</p>
          <p className="mt-1 max-w-[200px] text-xs text-muted-foreground">
            Click any document in your library to see its details here.
          </p>
        </div>
      </aside>
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
    <aside className="-ml-px hidden min-w-0 flex-1 border-l border-border lg:block">
      <div className="sticky top-14 h-[calc(100svh-3.5rem)] overflow-y-auto">
        <div
          key={selectedDocumentId}
          className="animate-in fade-in slide-in-from-top-2 duration-200"
        >
          <DocumentDetailContent documentId={selectedDocumentId} onClose={closeDetail} />
        </div>
      </div>
    </aside>
  );
}

function DocumentDetailContent({
  documentId,
  onClose,
}: {
  documentId: Id<"documents">;
  onClose: () => void;
}) {
  const { data: document } = useQuery(convexQuery(api.documents.get, { id: documentId }));
  const deleteDocument = useAction(api.documentActions.deleteDocument);
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
      <div className="px-6 py-5">
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="mt-3 h-4 w-1/3" />
        <Skeleton className="mt-6 h-32 w-full" />
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

  return (
    <div className="px-6 py-5">
      <div className="flex items-start justify-between gap-3">
        <h2 className="flex min-w-0 items-start gap-2.5 text-lg font-bold tracking-tight">
          <span className="mt-0.5 shrink-0 text-muted-foreground">
            {fileTypeIcons[document.fileType] ?? <FileText className="size-4" />}
          </span>
          <span className="min-w-0 break-all">{document.title}</span>
        </h2>
        <Button variant="ghost" size="icon" onClick={onClose} className="shrink-0">
          <X className="size-4" />
          <span className="sr-only">Close</span>
        </Button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <StatusBadge status={document.status} />
        <Badge
          variant="outline"
          className="rounded-none border-border bg-transparent font-normal text-muted-foreground"
        >
          {document.fileType.toUpperCase()}
        </Badge>
        {document.sourceUrl && (
          <a
            href={document.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            <Globe className="size-3" />
            {new URL(document.sourceUrl).hostname}
          </a>
        )}
        <span className="text-xs text-muted-foreground">
          {formatDistanceToNow(document.createdAt, { addSuffix: true })}
        </span>
        {document.status === "ready" && (
          <span className="text-xs text-muted-foreground">
            {document.chunkCount} chunk{document.chunkCount !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      <div className="mt-4 flex justify-end gap-2">
        {document.status === "ready" && <ImportHighlightsDialog documentId={document._id} />}
        <AlertDialog
          open={deleteDialogOpen}
          onOpenChange={(open) => {
            if (!isDeleting) setDeleteDialogOpen(open);
          }}
        >
          <AlertDialogTrigger
            render={<Button variant="destructive" size="sm" data-testid="delete-document-button" />}
          >
            <Trash2 data-icon="inline-start" />
            Delete
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete document</AlertDialogTitle>
              <AlertDialogDescription>
                Delete &ldquo;{document.title}&rdquo;? This will remove the document and all
                generated cards. This cannot be undone.
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

      {document.status === "ready" && (
        <>
          <DocumentTagSection documentId={document._id} />
          <LearningGoalSection documentId={document._id} initialGoal={document.learningGoal} />
          <HighlightsSection documentId={document._id} />
          <BookmarkedCardsSection documentId={document._id} />
        </>
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
        <div className="mt-10 flex flex-col items-center gap-4 text-center" role="status">
          <div className="flex size-12 items-center justify-center border border-destructive/30 bg-transparent">
            <Loader2 className="size-5 animate-spin text-destructive" aria-hidden="true" />
          </div>
          <p className="text-sm text-muted-foreground">Deleting document...</p>
        </div>
      )}
    </div>
  );
}
