import { convexQuery } from "@convex-dev/react-query";
import { api } from "@scrollect/backend/convex/_generated/api";
import type { Id } from "@scrollect/backend/convex/_generated/dataModel";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link, createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import { useAction } from "convex/react";
import { formatDistanceToNow } from "date-fns";
import { ArrowLeft, FileText, Loader2, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { StatusBadge, fileTypeIcons } from "@/components/document-status";
import { NotFound } from "@/components/not-found";
import { DocumentTagSection } from "@/components/tags/document-tag-section";
import { Alert, AlertDescription } from "@/components/ui/alert";
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

const PROCESSING_STATUSES = new Set(["parsing", "chunking", "embedding", "summarizing"]);

export const Route = createFileRoute("/_authenticated/library/$documentId")({
  loader: async ({ params: { documentId }, context }) => {
    const data = await context.queryClient.ensureQueryData(
      convexQuery(api.documents.get, { id: documentId as Id<"documents"> }),
    );
    if (!data) throw notFound();
    return { title: data.title };
  },
  head: ({ loaderData }) => ({
    meta: [
      {
        title: loaderData?.title ? `${loaderData.title} | Scrollect` : "Document | Scrollect",
      },
    ],
  }),
  notFoundComponent: () => (
    <NotFound>This document doesn&apos;t exist or you don&apos;t have access to it.</NotFound>
  ),
  component: DocumentDetailPage,
});

function DocumentDetailPage() {
  const { documentId } = Route.useParams();
  const { data: document } = useSuspenseQuery(
    convexQuery(api.documents.get, { id: documentId as Id<"documents"> }),
  );
  const navigate = useNavigate();
  const deleteDocument = useAction(api.documentActions.deleteDocument);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  if (!document) throw notFound();

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteDocument({ documentId: document._id });
      setDeleteDialogOpen(false);
      toast.success("Document deleted");
      await navigate({ to: "/library" });
    } catch {
      toast.error("Failed to delete document");
      setIsDeleting(false);
    }
  };

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8 md:px-6">
      <Link
        to="/library"
        className="group inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-0.5" />
        Back to Library
      </Link>

      <div className="mt-6">
        <h1 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight">
          <span className="text-muted-foreground">
            {fileTypeIcons[document.fileType] ?? <FileText className="size-5" />}
          </span>
          <span>{document.title}</span>
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

        <div className="mt-4 flex justify-end">
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

      {document.status === "ready" && <DocumentTagSection documentId={document._id} />}

      {document.status === "error" && document.errorMessage && (
        <Alert variant="destructive" className="mt-6">
          <AlertDescription>{document.errorMessage}</AlertDescription>
        </Alert>
      )}

      {PROCESSING_STATUSES.has(document.status) && (
        <div className="mt-10 flex flex-col items-center gap-3 text-center" role="status">
          <Loader2 className="size-8 animate-spin text-primary" aria-hidden="true" />
          <p className="text-muted-foreground">Processing your document...</p>
        </div>
      )}

      {document.status === "uploaded" && (
        <div className="mt-10 flex flex-col items-center gap-3 text-center" role="status">
          <Loader2 className="size-8 animate-spin text-amber-500" aria-hidden="true" />
          <p className="text-muted-foreground">Waiting for processing...</p>
        </div>
      )}

      {document.status === "deleting" && (
        <div className="mt-10 flex flex-col items-center gap-3 text-center" role="status">
          <Loader2 className="size-8 animate-spin text-destructive" aria-hidden="true" />
          <p className="text-muted-foreground">Deleting document...</p>
        </div>
      )}
    </div>
  );
}
