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
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

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
        <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
        Back to Library
      </Link>

      <div className="mt-6">
        <h1 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight">
          <span className="text-muted-foreground">
            {fileTypeIcons[document.fileType] ?? <FileText className="h-5 w-5" />}
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
          <Dialog
            open={deleteDialogOpen}
            onOpenChange={(open) => {
              if (!isDeleting) setDeleteDialogOpen(open);
            }}
          >
            <DialogTrigger
              render={
                <Button variant="destructive" size="sm" data-testid="delete-document-button" />
              }
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete document
            </DialogTrigger>
            <DialogContent showCloseButton={!isDeleting}>
              <DialogHeader>
                <DialogTitle>Delete document</DialogTitle>
                <DialogDescription>
                  Delete &ldquo;{document.title}&rdquo;? This will remove the document and all
                  generated cards. This cannot be undone.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose
                  render={
                    <Button
                      variant="outline"
                      disabled={isDeleting}
                      data-testid="cancel-delete-button"
                    />
                  }
                >
                  Cancel
                </DialogClose>
                <Button
                  variant="destructive"
                  disabled={isDeleting}
                  onClick={handleDelete}
                  data-testid="confirm-delete-button"
                >
                  {isDeleting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Delete
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {document.status === "ready" && <DocumentTagSection documentId={document._id} />}

      {document.status === "error" && document.errorMessage && (
        <div className="mt-6 rounded-lg border border-destructive/20 border-l-4 border-l-destructive bg-destructive/5 p-4 text-sm text-destructive">
          {document.errorMessage}
        </div>
      )}

      {(document.status === "parsing" ||
        document.status === "chunking" ||
        document.status === "embedding" ||
        document.status === "summarizing") && (
        <div className="mt-10 flex flex-col items-center gap-3 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Processing your document...</p>
        </div>
      )}

      {document.status === "uploaded" && (
        <div className="mt-10 flex flex-col items-center gap-3 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
          <p className="text-muted-foreground">Waiting for processing...</p>
        </div>
      )}
    </div>
  );
}
