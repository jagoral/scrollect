import { convexQuery } from "@convex-dev/react-query";
import { api } from "@scrollect/backend/convex/_generated/api";
import type { Id } from "@scrollect/backend/convex/_generated/dataModel";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { useAction } from "convex/react";
import { formatDistanceToNow } from "date-fns";
import { ArrowLeft, FileText, Loader2, Trash2 } from "lucide-react";
import { usePostHog } from "posthog-js/react";
import { useState } from "react";
import { toast } from "sonner";

import { fileTypeIcons, StatusBadge } from "@/components/document-status";
import { HighlightsSection } from "@/components/documents/highlights-section";
import { BookmarkedCardsSection } from "@/components/documents/bookmarked-cards-section";
import { ImportHighlightsDialog } from "@/components/documents/import-highlights-dialog";
import { LearningGoalSection } from "@/components/documents/learning-goal-section";
import { PipelineError } from "@/components/documents/pipeline-error";
import { ProcessingProgress, isProcessingStatus } from "@/components/documents/processing-progress";
import { NotFound } from "@/components/not-found";
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
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/app/library/$documentId")({
  ssr: false,
  head: () => ({
    meta: [{ title: "Document | Scrollect" }],
  }),
  notFoundComponent: () => (
    <NotFound>This document doesn&apos;t exist or you don&apos;t have access to it.</NotFound>
  ),
  component: DocumentDetailPage,
});

function DocumentDetailPage() {
  const { documentId } = Route.useParams();
  const { data: document } = useQuery(
    convexQuery(api.documents.get, { id: documentId as Id<"documents"> }),
  );
  const navigate = useNavigate();
  const deleteDocument = useAction(api.documentActions.deleteDocument);
  const posthog = usePostHog();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  if (document === undefined) {
    return (
      <div className="container mx-auto max-w-3xl px-4 py-8 md:px-6">
        <div className="mb-6 h-4 w-24">
          <Skeleton className="h-full w-full" />
        </div>
        <Skeleton className="h-8 w-2/3 rounded" />
        <Skeleton className="mt-4 h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (!document) throw notFound();

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteDocument({ documentId: document._id });
      posthog.capture("document.deleted", { file_type: document.fileType });
      setDeleteDialogOpen(false);
      toast.success("Document deleted");
      await navigate({ to: "/app/library" });
    } catch (error) {
      posthog.captureException(error);
      toast.error("Failed to delete document");
      setIsDeleting(false);
    }
  };

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8 md:px-6">
      <Link
        to="/app/library"
        className="group inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-0.5" />
        Back to Library
      </Link>

      <div className="mt-6">
        <h1 className="flex items-start gap-2.5 text-2xl font-bold tracking-tight">
          <span className="mt-1 shrink-0 text-muted-foreground">
            {fileTypeIcons[document.fileType] ?? <FileText className="size-5" />}
          </span>
          <span className="break-words min-w-0">{document.title}</span>
        </h1>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <StatusBadge status={document.status} />
          <span className="text-sm text-muted-foreground">{document.fileType.toUpperCase()}</span>
          <span className="text-sm text-muted-foreground">
            {formatDistanceToNow(document.createdAt, { addSuffix: true })}
          </span>
          {document.status === "ready" && (
            <span className="text-sm text-muted-foreground">
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
              render={
                <Button variant="destructive" size="sm" data-testid="delete-document-button" />
              }
            >
              <Trash2 data-icon="inline-start" />
              Delete document
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
          <div className="flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-destructive/10 to-destructive/5 ring-1 ring-destructive/10">
            <Loader2 className="size-5 animate-spin text-destructive" aria-hidden="true" />
          </div>
          <p className="text-sm text-muted-foreground">Deleting document...</p>
        </div>
      )}
    </div>
  );
}
