import { convexQuery } from "@convex-dev/react-query";
import { api } from "@scrollect/backend/convex/_generated/api";
import type { Id } from "@scrollect/backend/convex/_generated/dataModel";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, usePaginatedQuery } from "convex/react";
import { Loader2, Sparkles } from "lucide-react";
import { usePostHog } from "posthog-js/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  DocumentFeedEmptyState,
  FeedEmptyState,
  TopicFeedEmptyState,
  UnknownScopeState,
} from "@/components/feed/feed-empty-states";
import { FeedEndState } from "@/components/feed/feed-end-state";
import { FeedScopeBanner } from "@/components/feed/feed-scope-banner";
import { FeedSkeleton } from "@/components/feed/feed-skeleton";
import { UnreadPostsBanner } from "@/components/feed/unread-posts-banner";
import { PageHeader } from "@/components/page-header";
import { Post } from "@/components/posts";
import { buildTagMap } from "@/components/tags";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useFeedScope } from "@/hooks/use-feed-scope";
import { useFeedUnreadPosts } from "@/hooks/use-feed-unread-posts";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";
import { scrollToPostId } from "@/lib/scroll-to-post";

/**
 * Feed search params. `topicId` and `documentId` are mutually exclusive;
 * `topicId` wins when both are present.
 */
type FeedSearch = {
  noAutoServe?: boolean;
  scope?: "all" | "document" | "topic";
  documentId?: string;
  topicId?: string;
};

export const Route = createFileRoute("/_authenticated/app/feed")({
  ssr: false,
  head: () => ({
    meta: [{ title: "Feed | Scrollect" }],
  }),
  validateSearch: (search: Record<string, unknown>): FeedSearch => {
    const topicId =
      typeof search.topicId === "string" && search.topicId.length > 0 ? search.topicId : undefined;
    const documentId =
      !topicId && typeof search.documentId === "string" && search.documentId.length > 0
        ? search.documentId
        : undefined;

    const scope: FeedSearch["scope"] = topicId
      ? "topic"
      : documentId
        ? "document"
        : search.scope === "all"
          ? "all"
          : undefined;

    return {
      noAutoServe:
        search.noAutoServe === true ||
        search.noAutoServe === "true" ||
        search.noAutoServe === "" ||
        search.noAutoGenerate === true ||
        search.noAutoGenerate === "true" ||
        search.noAutoGenerate === "",
      scope,
      documentId,
      topicId,
    };
  },
  component: FeedPage,
});

function FeedPage() {
  const { noAutoServe, documentId, topicId } = Route.useSearch();
  const navigate = Route.useNavigate();
  const posthog = usePostHog();

  const scope = useFeedScope({ topicId, documentId });
  const {
    kind: scopeKind,
    scopedTopicId,
    scopedDocumentId,
    scopedTopic,
    scopedDocument,
    topicNotFound,
    documentNotFound,
    scopeNotFound,
    feedScopeKey,
    feedScopeLabel,
    malformedTopicId,
    malformedDocumentId,
  } = scope;

  const feedArgs = useMemo(
    () =>
      scopedTopicId
        ? { topicId: scopedTopicId }
        : scopedDocumentId
          ? { documentId: scopedDocumentId }
          : {},
    [scopedTopicId, scopedDocumentId],
  );

  const skipFeedQuery = malformedTopicId || malformedDocumentId;
  const { results, status, loadMore } = usePaginatedQuery(
    api.feed.queries.list,
    skipFeedQuery ? "skip" : feedArgs,
    { initialNumItems: 10 },
  );
  const serveFeed = useMutation(api.feed.serving.serveFeed);
  const serveDocumentFeed = useMutation(api.feed.serving.serveDocumentFeed);
  const serveTopicFeed = useMutation(api.feed.serving.serveTopicFeed);

  const [serving, setServing] = useState(false);
  const [serveReason, setServeReason] = useState<"no_drafts" | "processing" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingJumpPostId, setPendingJumpPostId] = useState<string | null>(null);

  const {
    firstUnreadPostId,
    unreadCount,
    unreadPostIdSet,
    registerBatch,
    clearBatch,
    markBatchSeenForPost,
  } = useFeedUnreadPosts(feedScopeKey);

  const servingRef = useRef(false);

  const serve = useCallback(async () => {
    if (servingRef.current) return;
    servingRef.current = true;
    setServing(true);
    setError(null);
    setServeReason(null);
    try {
      const result = scopedTopicId
        ? await serveTopicFeed({ topicId: scopedTopicId })
        : scopedDocumentId
          ? await serveDocumentFeed({ documentId: scopedDocumentId })
          : await serveFeed({});
      posthog.capture("feed.served", {
        post_count: result.posts.length,
        reason: result.reason ?? null,
        scope: scopeKind,
        documentId: scopedDocumentId ?? null,
        topicId: scopedTopicId ?? null,
      });
      if (result.posts.length > 0) {
        const postIds = result.posts.map((postId) => postId as string);
        registerBatch(postIds);
        setPendingJumpPostId(postIds[0] ?? null);
      }
      if (result.reason) {
        setServeReason(result.reason);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to load feed";
      setError(message);
      posthog.captureException(e instanceof Error ? e : new Error(message));
    } finally {
      servingRef.current = false;
      setServing(false);
    }
  }, [
    serveDocumentFeed,
    serveFeed,
    serveTopicFeed,
    posthog,
    scopedDocumentId,
    scopedTopicId,
    scopeKind,
    registerBatch,
  ]);

  // Only auto-serve once the paginated query has completed with zero rows.
  // Earlier statuses ("LoadingFirstPage", "LoadingMore", "CanLoadMore") can
  // expose a transient empty `results` array between scope switches before the
  // WebSocket replies, which would fire serve() against a feed that's still
  // loading. "Exhausted" is the only status where empty == genuinely empty.
  const isReadyForAutoServe =
    !noAutoServe && !scopeNotFound && status === "Exhausted" && results.length === 0;
  const lastAutoServedScopeRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isReadyForAutoServe) return;
    if (lastAutoServedScopeRef.current === feedScopeKey) return;
    lastAutoServedScopeRef.current = feedScopeKey;
    serve();
  }, [isReadyForAutoServe, feedScopeKey, serve]);

  const lastOpenedScopeRef = useRef<string | null>(null);
  useEffect(() => {
    const scopeId = scopedTopicId ?? scopedDocumentId;
    if (!scopeId) return;
    if (scopeNotFound) return;
    if (lastOpenedScopeRef.current === scopeId) return;
    lastOpenedScopeRef.current = scopeId;
    posthog.capture("feed_scope_opened", {
      scope: scopeKind,
      documentId: scopedDocumentId ?? null,
      topicId: scopedTopicId ?? null,
    });
  }, [posthog, scopeNotFound, scopedDocumentId, scopedTopicId, scopeKind]);

  const handleServe = useCallback(() => {
    posthog.capture("feed.serve_clicked", {
      existing_post_count: results.length,
      scope: scopeKind,
      documentId: scopedDocumentId ?? null,
      topicId: scopedTopicId ?? null,
    });
    serve();
  }, [posthog, serve, results.length, scopedDocumentId, scopedTopicId, scopeKind]);

  const handleResetScope = useCallback(() => {
    posthog.capture("feed_scope_reset", {
      from_scope: scopeKind,
      documentId: scopedDocumentId ?? null,
      topicId: scopedTopicId ?? null,
    });
    navigate({
      search: (prev) => ({
        ...prev,
        documentId: undefined,
        topicId: undefined,
      }),
    });
  }, [navigate, posthog, scopedDocumentId, scopedTopicId, scopeKind]);

  const jumpToUnreadPost = useCallback(() => {
    if (!firstUnreadPostId) return;
    posthog.capture("feed.unread_jump_clicked", {
      count: unreadCount,
      scope: scopeKind,
      documentId: scopedDocumentId ?? null,
      topicId: scopedTopicId ?? null,
    });
    setPendingJumpPostId(firstUnreadPostId);
  }, [firstUnreadPostId, posthog, scopedDocumentId, scopedTopicId, scopeKind, unreadCount]);

  const dismissUnreadPosts = useCallback(() => {
    posthog.capture("feed.unread_batch_dismissed", {
      count: unreadCount,
      scope: scopeKind,
      documentId: scopedDocumentId ?? null,
      topicId: scopedTopicId ?? null,
    });
    clearBatch();
  }, [clearBatch, posthog, scopedDocumentId, scopedTopicId, scopeKind, unreadCount]);

  const handlePostViewed = useCallback(
    (postId: string) => {
      const wasUnread = unreadPostIdSet.has(postId);
      markBatchSeenForPost(postId);
      if (!wasUnread) return;

      posthog.capture("feed.unread_batch_seen", {
        count: unreadCount,
        scope: scopeKind,
        documentId: scopedDocumentId ?? null,
        topicId: scopedTopicId ?? null,
      });
    },
    [
      markBatchSeenForPost,
      posthog,
      scopedDocumentId,
      scopedTopicId,
      scopeKind,
      unreadCount,
      unreadPostIdSet,
    ],
  );

  const sentinelRef = useInfiniteScroll(status, loadMore);

  const docIdKey = results.map((p) => p.primarySourceDocumentId).join(",");
  const uniqueDocumentIds = useMemo(
    () => [...new Set(results.map((p) => p.primarySourceDocumentId))] as Id<"documents">[],
    [docIdKey], // eslint-disable-line react-hooks/exhaustive-deps -- stabilized via serialized key
  );

  const { data: tagsBatch } = useQuery(
    convexQuery(
      api.content.tags.getDocumentTagsBatch,
      results.length > 0 ? { documentIds: uniqueDocumentIds } : "skip",
    ),
  );

  // Stabilize tagsByDocId across WebSocket re-emissions: tagsBatch gets a fresh
  // reference each tick even when the underlying tag set is unchanged. Hash on
  // a serialized signature so `enrichedResults` (and downstream <Post> props)
  // only re-derive when tags actually change.
  const tagsBatchKey = tagsBatch
    ? Object.entries(tagsBatch)
        .map(([docId, tags]) => `${docId}:${tags.map((t) => t._id).join(",")}`)
        .sort()
        .join("|")
    : "";
  const tagsByDocId = useMemo(
    () => buildTagMap(tagsBatch),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stabilized via serialized key
    [tagsBatchKey],
  );

  const enrichedResults = useMemo(
    () =>
      results.map((post) => ({
        ...post,
        tags: tagsByDocId.get(post.primarySourceDocumentId) ?? [],
      })),
    [results, tagsByDocId],
  );
  const postIdKey = enrichedResults.map((post) => post._id).join(",");

  const jumpLoadRequestRef = useRef<string | null>(null);
  useEffect(() => {
    if (!pendingJumpPostId) return;
    const result = scrollToPostId(pendingJumpPostId);
    if (!result.found) {
      const loadRequestKey = `${pendingJumpPostId}:${postIdKey}`;
      if (status === "CanLoadMore" && jumpLoadRequestRef.current !== loadRequestKey) {
        jumpLoadRequestRef.current = loadRequestKey;
        loadMore(10);
        return;
      }
      // No more pages to load and we still couldn't find the post: it's been
      // deleted, filtered out, or never made it into a served page. Drop the
      // pending jump so we don't loop, and skip analytics — there's no jump.
      if (status === "Exhausted") {
        jumpLoadRequestRef.current = null;
        setPendingJumpPostId(null);
      }
      return;
    }

    if (result.scrolled) {
      posthog.capture("feed.unread_jump_performed", {
        scope: scopeKind,
        documentId: scopedDocumentId ?? null,
        topicId: scopedTopicId ?? null,
      });
    }
    jumpLoadRequestRef.current = null;
    setPendingJumpPostId(null);
  }, [
    loadMore,
    pendingJumpPostId,
    posthog,
    postIdKey,
    scopedDocumentId,
    scopedTopicId,
    scopeKind,
    status,
  ]);

  const prevStatusRef = useRef(status);
  useEffect(() => {
    if (prevStatusRef.current !== "Exhausted" && status === "Exhausted") {
      posthog.capture("feed.exhausted", { total_posts: enrichedResults.length });
    }
    prevStatusRef.current = status;
  }, [status, posthog, enrichedResults.length]);

  if (status === "LoadingFirstPage" && !skipFeedQuery) {
    return <FeedSkeleton />;
  }

  const headerEyebrow = scopedTopicId
    ? "Topic Feed"
    : scopedDocumentId
      ? "Document Feed"
      : "Your Feed";
  const headerDescription = scopedTopicId
    ? "Learning posts focused on this topic's goal."
    : scopedDocumentId
      ? "Learning posts from this document."
      : "Your AI-generated learning posts.";

  return (
    <div className="pb-6">
      <PageHeader
        eyebrow={headerEyebrow}
        title="Feed"
        description={headerDescription}
        actions={
          <Button onClick={handleServe} disabled={serving} data-testid="feed-serve-button">
            {serving ? (
              <Loader2 className="size-4 animate-spin" data-icon="inline-start" />
            ) : (
              <Sparkles className="size-4" data-icon="inline-start" />
            )}
            Generate
          </Button>
        }
      />

      {scopedTopicId && scopedTopic && (
        <FeedScopeBanner scope="topic" topic={scopedTopic} onReset={handleResetScope} />
      )}
      {!scopedTopicId && scopedDocumentId && scopedDocument && (
        <FeedScopeBanner
          scope="document"
          documentTitle={scopedDocument.title}
          onReset={handleResetScope}
        />
      )}

      {error && (
        <Alert variant="destructive" className="mx-4 mt-6 md:mx-6">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {topicNotFound ? (
        <UnknownScopeState scope="topic" />
      ) : documentNotFound ? (
        <UnknownScopeState scope="document" />
      ) : enrichedResults.length === 0 && !serving ? (
        scopedTopicId ? (
          <TopicFeedEmptyState topicName={scopedTopic?.name} reason={serveReason} />
        ) : scopedDocumentId ? (
          <DocumentFeedEmptyState document={scopedDocument} reason={serveReason} />
        ) : (
          <FeedEmptyState reason={serveReason} onServe={handleServe} serving={serving} />
        )
      ) : (
        <div className="animate-stagger-in">
          <UnreadPostsBanner
            count={unreadCount}
            scopeLabel={feedScopeLabel}
            onJump={jumpToUnreadPost}
            onDismiss={dismissUnreadPosts}
          />
          <div className="border-b border-border">
            {enrichedResults.map((post) => {
              const isUnread = unreadPostIdSet.has(post._id);
              return (
                <Post
                  key={post._id}
                  post={{ ...post, isNew: isUnread }}
                  onViewed={handlePostViewed}
                />
              );
            })}
          </div>

          <div ref={sentinelRef} className="h-1" />

          {status === "LoadingMore" && (
            <div className="flex justify-center py-4 animate-in fade-in duration-300">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {status === "Exhausted" && enrichedResults.length > 0 && (
            <FeedEndState onServe={handleServe} serving={serving} />
          )}
        </div>
      )}
    </div>
  );
}
