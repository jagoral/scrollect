import { convexQuery } from "@convex-dev/react-query";
import { api } from "@scrollect/backend/convex/_generated/api";
import type { Doc, Id } from "@scrollect/backend/convex/_generated/dataModel";
import { useQuery } from "@tanstack/react-query";

import { looksLikeConvexId } from "@/lib/convex-id";

export type FeedScopeKind = "topic" | "document" | "all";

export interface FeedScope {
  kind: FeedScopeKind;
  scopedTopicId: Id<"topics"> | undefined;
  scopedDocumentId: Id<"documents"> | undefined;
  malformedTopicId: boolean;
  malformedDocumentId: boolean;
  scopedTopic: Doc<"topics"> | undefined;
  scopedDocument: Doc<"documents"> | null | undefined;
  topicNotFound: boolean;
  documentNotFound: boolean;
  scopeNotFound: boolean;
  feedScopeKey: string;
  feedScopeLabel: string;
}

export interface FeedScopeInput {
  topicId: string | undefined;
  documentId: string | undefined;
}

/**
 * Resolves the feed's current scope from search params.
 *
 * `topicId` and `documentId` are mutually exclusive; `topicId` wins when both are
 * present. Validates ids against the Convex id shape so a malformed id renders
 * the unknown-scope state rather than tripping a server-side validator.
 */
export function useFeedScope({ topicId, documentId }: FeedScopeInput): FeedScope {
  const validTopicId =
    topicId && looksLikeConvexId(topicId) ? (topicId as Id<"topics">) : undefined;
  const validDocumentId =
    !validTopicId && documentId && looksLikeConvexId(documentId)
      ? (documentId as Id<"documents">)
      : undefined;

  const malformedTopicId = topicId !== undefined && validTopicId === undefined;
  const malformedDocumentId =
    !validTopicId && documentId !== undefined && validDocumentId === undefined;

  const { data: topicQueryResult } = useQuery(
    convexQuery(api.topics.topics.getTopic, validTopicId ? { topicId: validTopicId } : "skip"),
  );
  const { data: scopedDocument } = useQuery(
    convexQuery(api.content.documents.get, validDocumentId ? { id: validDocumentId } : "skip"),
  );
  const scopedTopic = topicQueryResult?.topic ?? undefined;

  const kind: FeedScopeKind = validTopicId ? "topic" : validDocumentId ? "document" : "all";

  const topicNotFound =
    malformedTopicId || (validTopicId !== undefined && topicQueryResult === null);
  const documentNotFound =
    malformedDocumentId || (validDocumentId !== undefined && scopedDocument === null);
  const scopeNotFound = topicNotFound || documentNotFound;

  const feedScopeKey = validTopicId
    ? `topic:${validTopicId}`
    : validDocumentId
      ? `document:${validDocumentId}`
      : "all";

  const feedScopeLabel = validTopicId
    ? (scopedTopic?.name ?? "this topic feed")
    : validDocumentId
      ? (scopedDocument?.title ?? "this document feed")
      : "your feed";

  return {
    kind,
    scopedTopicId: validTopicId,
    scopedDocumentId: validDocumentId,
    malformedTopicId,
    malformedDocumentId,
    scopedTopic,
    scopedDocument,
    topicNotFound,
    documentNotFound,
    scopeNotFound,
    feedScopeKey,
    feedScopeLabel,
  };
}
