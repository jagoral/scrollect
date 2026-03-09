import { api } from "@scrollect/backend/convex/_generated/api";
import type { Id } from "@scrollect/backend/convex/_generated/dataModel";
import { redirect } from "next/navigation";

import { isAuthenticated, preloadAuthQuery } from "@/lib/auth-server";

import { DocumentDetailContent } from "./document-detail-content";

export default async function DocumentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ documentId: string }>;
  searchParams: Promise<{ chunk?: string }>;
}) {
  if (!(await isAuthenticated())) redirect("/signin");

  const { documentId } = await params;
  const { chunk } = await searchParams;
  const id = documentId as Id<"documents">;

  const highlightChunkIndex = chunk != null && !Number.isNaN(Number(chunk)) ? Number(chunk) : null;

  const [preloadedDocument, preloadedChunks] = await Promise.all([
    preloadAuthQuery(api.documents.get, { id }),
    preloadAuthQuery(api.chunks.listByDocument, { documentId: id }),
  ]);

  return (
    <DocumentDetailContent
      preloadedDocument={preloadedDocument}
      preloadedChunks={preloadedChunks}
      highlightChunkIndex={highlightChunkIndex}
    />
  );
}
