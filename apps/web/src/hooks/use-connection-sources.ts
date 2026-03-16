import { convexQuery } from "@convex-dev/react-query";
import { api } from "@scrollect/backend/convex/_generated/api";
import type { Id } from "@scrollect/backend/convex/_generated/dataModel";
import { useQuery } from "@tanstack/react-query";

export interface ConnectionSource {
  documentId: Id<"documents">;
  documentTitle: string;
  chunkContent: string;
  sectionTitle: string | null;
  pageNumber: number | null;
}

interface UseConnectionSourcesParams {
  postId: Id<"posts">;
  primarySourceDocumentId: Id<"documents">;
}

export function useConnectionSources({
  postId,
  primarySourceDocumentId,
}: UseConnectionSourcesParams) {
  const {
    data: postSources,
    isPending,
    isError,
  } = useQuery({
    ...convexQuery(api.feed.queries.listSourcesByPostId, { postId }),
  });

  const { sourceA, sourceB } = splitSources(postSources, primarySourceDocumentId);

  return { sourceA, sourceB, isLoading: isPending, isError };
}

type PostSource = {
  documentId: Id<"documents">;
  documentTitle: string | null;
  chunkId: Id<"chunks">;
  chunkContent: string | null;
  sectionTitle: string | null;
  pageNumber: number | null;
};

function splitSources(
  postSources: PostSource[] | undefined,
  primarySourceDocumentId: Id<"documents">,
): { sourceA: ConnectionSource | null; sourceB: ConnectionSource | null } {
  if (!postSources || postSources.length === 0) {
    return { sourceA: null, sourceB: null };
  }

  // For cross-document connections, split by document ID.
  // For within-document connections (same doc, different sections),
  // use the first two distinct chunks.
  const firstSource = postSources[0]!;
  const secondSource =
    postSources.find((s) => s.documentId !== primarySourceDocumentId) ??
    postSources.find((s) => s.chunkId !== firstSource.chunkId);

  return {
    sourceA: toConnectionSource(firstSource),
    sourceB: secondSource ? toConnectionSource(secondSource) : null,
  };
}

function toConnectionSource(s: PostSource): ConnectionSource {
  return {
    documentId: s.documentId,
    documentTitle: s.documentTitle ?? "Untitled",
    chunkContent: s.chunkContent ?? "",
    sectionTitle: s.sectionTitle,
    pageNumber: s.pageNumber,
  };
}
