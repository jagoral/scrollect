import { convexQuery } from "@convex-dev/react-query";
import { api } from "@scrollect/backend/convex/_generated/api";
import type { Id } from "@scrollect/backend/convex/_generated/dataModel";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link, createFileRoute, notFound } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { ArrowLeft, FileText, Loader2 } from "lucide-react";

import { StatusBadge, fileTypeIcons } from "@/components/document-status";
import { NotFound } from "@/components/not-found";
import { DocumentTagSection } from "@/components/tags/document-tag-section";

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

  if (!document) throw notFound();

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
        document.status === "embedding") && (
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
