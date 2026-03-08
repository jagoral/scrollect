import { api } from "@scrollect/backend/convex/_generated/api";
import type { Id } from "@scrollect/backend/convex/_generated/dataModel";
import { redirect } from "next/navigation";

import { isAuthenticated, preloadAuthQuery } from "@/lib/auth-server";

import { DocumentDetailContent } from "./document-detail-content";

export default async function DocumentDetailPage({
  params,
}: {
  params: Promise<{ documentId: string }>;
}) {
  if (!(await isAuthenticated())) redirect("/signin");

  const { documentId } = await params;
  const id = documentId as Id<"documents">;

  const [preloadedDocument, preloadedChunks] = await Promise.all([
    preloadAuthQuery(api.documents.get, { id }),
    preloadAuthQuery(api.chunks.listByDocument, { documentId: id }),
  ]);

  return (
    <DocumentDetailContent
      preloadedDocument={preloadedDocument}
      preloadedChunks={preloadedChunks}
    />
  );
}
