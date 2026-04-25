import { api } from "@scrollect/backend/convex/_generated/api";
import type { Doc, Id } from "@scrollect/backend/convex/_generated/dataModel";
import { Link, createFileRoute } from "@tanstack/react-router";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useMutation, usePaginatedQuery } from "convex/react";
import {
  BookOpen,
  CheckCircle,
  FileUp,
  Library,
  Loader2,
  Rss,
  Sparkles,
  Timer,
} from "lucide-react";
import { usePostHog } from "posthog-js/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { StatusBadge } from "@/components/document-status";
import { FeedScopeBanner } from "@/components/feed/feed-scope-banner";
import { UnreadPostsBanner } from "@/components/feed/unread-posts-banner";
import { PageHeader } from "@/components/page-header";
import { Post } from "@/components/posts";
import { buildTagMap } from "@/components/tags";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useFeedUnreadPosts } from "@/hooks/use-feed-unread-posts";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";
import { looksLikeConvexId } from "@/lib/convex-id";

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
  const validTopicId =
    topicId && looksLikeConvexId(topicId) ? (topicId as Id<"topics">) : undefined;
  const validDocumentId =
    !validTopicId && documentId && looksLikeConvexId(documentId)
      ? (documentId as Id<"documents">)
      : undefined;
  const malformedTopicId = topicId !== undefined && validTopicId === undefined;
  const malformedDocumentId =
    !validTopicId && documentId !== undefined && validDocumentId === undefined;
  const scopedTopicId = validTopicId;
  const scopedDocumentId = validDocumentId;
  const feedArgs = useMemo(
    () =>
      scopedTopicId
        ? { topicId: scopedTopicId }
        : scopedDocumentId
          ? { documentId: scopedDocumentId }
          : {},
    [scopedTopicId, scopedDocumentId],
  );
  const feedScopeKey = scopedTopicId
    ? `topic:${scopedTopicId}`
    : scopedDocumentId
      ? `document:${scopedDocumentId}`
      : "all";

  const skipFeedQuery = malformedTopicId || malformedDocumentId;
  const { results, status, loadMore } = usePaginatedQuery(
    api.feed.queries.list,
    skipFeedQuery ? "skip" : feedArgs,
    {
      initialNumItems: 10,
    },
  );
  const serveFeed = useMutation(api.feed.serving.serveFeed);
  const serveDocumentFeed = useMutation(api.feed.serving.serveDocumentFeed);
  const serveTopicFeed = useMutation(api.feed.serving.serveTopicFeed);
  const { data: scopedDocument } = useQuery(
    convexQuery(api.content.documents.get, scopedDocumentId ? { id: scopedDocumentId } : "skip"),
  );
  const { data: scopedTopicData } = useQuery(
    convexQuery(api.topics.topics.getTopic, scopedTopicId ? { topicId: scopedTopicId } : "skip"),
  );
  const scopedTopic = scopedTopicData?.topic;
  const feedScopeLabel = scopedTopicId
    ? (scopedTopic?.name ?? "this topic feed")
    : scopedDocumentId
      ? (scopedDocument?.title ?? "this document feed")
      : "your feed";

  const [serving, setServing] = useState(false);
  const [serveReason, setServeReason] = useState<"no_drafts" | "processing" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingJumpPostId, setPendingJumpPostId] = useState<string | null>(null);
  const autoServedScopeRef = useRef<string | null>(null);
  const jumpLoadRequestRef = useRef<string | null>(null);

  const posthog = usePostHog();
  const {
    firstUnreadPostId,
    unreadCount,
    unreadPostIdSet,
    registerBatch,
    clearBatch,
    markBatchSeenForPost,
  } = useFeedUnreadPosts(feedScopeKey);

  const servingRef = useRef(false);

  const scopeKind: "topic" | "document" | "all" = scopedTopicId
    ? "topic"
    : scopedDocumentId
      ? "document"
      : "all";

  const topicNotFound =
    malformedTopicId || (scopedTopicId !== undefined && scopedTopicData === null);
  const documentNotFound =
    malformedDocumentId || (scopedDocumentId !== undefined && scopedDocument === null);
  const scopeNotFound = topicNotFound || documentNotFound;

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

  useEffect(() => {
    if (noAutoServe) return;
    if (scopeNotFound) return;
    const autoServeKey = scopedTopicId ?? scopedDocumentId ?? "all";
    if (autoServedScopeRef.current === autoServeKey) return;
    if (status === "LoadingFirstPage") return;
    if (results.length > 0) return;

    autoServedScopeRef.current = autoServeKey;
    serve();
  }, [noAutoServe, scopeNotFound, scopedDocumentId, scopedTopicId, status, results.length, serve]);

  const openedScopeRef = useRef<string | null>(null);
  useEffect(() => {
    const scopeId = scopedTopicId ?? scopedDocumentId;
    if (!scopeId) return;
    if (scopeNotFound) return;
    if (openedScopeRef.current === scopeId) return;
    openedScopeRef.current = scopeId;
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

  const tagsByDocId = useMemo(() => buildTagMap(tagsBatch), [tagsBatch]);

  const enrichedResults = useMemo(
    () =>
      results.map((post) => ({
        ...post,
        tags: tagsByDocId.get(post.primarySourceDocumentId) ?? [],
      })),
    [results, tagsByDocId],
  );
  const postIdKey = enrichedResults.map((post) => post._id).join(",");

  useEffect(() => {
    if (!pendingJumpPostId) return;
    const didScroll = scrollToPostId(pendingJumpPostId);
    if (!didScroll) {
      const loadRequestKey = `${pendingJumpPostId}:${postIdKey}`;
      if (status === "CanLoadMore" && jumpLoadRequestRef.current !== loadRequestKey) {
        jumpLoadRequestRef.current = loadRequestKey;
        loadMore(10);
      }
      return;
    }

    posthog.capture("feed.unread_jump_performed", {
      scope: scopeKind,
      documentId: scopedDocumentId ?? null,
      topicId: scopedTopicId ?? null,
    });
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

  const exhaustedTracked = useRef(false);
  useEffect(() => {
    if (status === "Exhausted" && !exhaustedTracked.current) {
      exhaustedTracked.current = true;
      posthog.capture("feed.exhausted", {
        total_posts: enrichedResults.length,
      });
    }
    if (status !== "Exhausted") {
      exhaustedTracked.current = false;
    }
  }, [status, posthog]); // eslint-disable-line react-hooks/exhaustive-deps -- enrichedResults.length intentionally omitted; we only fire when status changes

  if (status === "LoadingFirstPage" && !skipFeedQuery) {
    return (
      <div className="pb-6">
        <PageHeader
          eyebrow="Your Feed"
          title="Feed"
          description="Your AI-generated learning posts."
        />
        <div className="border-b border-border">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="border-l-[2px] border-l-muted border-t border-border first:border-t-0 px-6 pt-6 pb-5"
            >
              <Skeleton className="mb-3 h-4 w-32" />
              <Skeleton className="mb-2 h-4 w-full" />
              <Skeleton className="mb-4 h-4 w-3/4" />
              <div className="flex items-center justify-between border-t border-border pt-3">
                <Skeleton className="h-3 w-20" />
                <div className="flex gap-1">
                  <Skeleton className="size-8 rounded-md" />
                  <Skeleton className="size-8 rounded-md" />
                  <Skeleton className="size-8 rounded-md" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
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
            <div
              data-testid="feed-end-state"
              className="flex flex-col items-center gap-4 py-12 text-center text-muted-foreground animate-in fade-in duration-500"
            >
              <div className="flex items-center gap-4">
                <div className="h-px w-16 bg-border" />
                <div className="flex size-10 items-center justify-center border-y border border-border">
                  <CheckCircle className="size-5 text-primary" />
                </div>
                <div className="h-px w-16 bg-border" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.1em]">
                  You&apos;re all caught up
                </p>
                <p className="mt-1 text-xs text-muted-foreground/60">
                  Generate more posts to keep learning.
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={handleServe} disabled={serving}>
                <Sparkles className="size-3.5" />
                Generate more
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function scrollToPostId(postId: string) {
  const post = Array.from(document.querySelectorAll<HTMLElement>("[data-post-id]")).find(
    (element) => element.dataset.postId === postId,
  );
  if (!post) return false;

  const rect = post.getBoundingClientRect();
  const isComfortablyVisible = rect.top >= 96 && rect.top <= window.innerHeight * 0.7;
  if (!isComfortablyVisible) {
    post.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return true;
}

interface DocumentFeedEmptyStateProps {
  document: Doc<"documents"> | null | undefined;
  reason: "no_drafts" | "processing" | null;
}

function DocumentFeedEmptyState({ document, reason }: DocumentFeedEmptyStateProps) {
  const status = document?.status;
  const waitingForProcessing =
    reason === "processing" ||
    status === "uploaded" ||
    status === "parsing" ||
    status === "chunking" ||
    status === "embedding" ||
    status === "summarizing" ||
    status === "generating_cards";

  return (
    <div
      data-testid="feed-document-empty-state"
      className="mt-12 flex flex-col items-center gap-5 px-4 text-center"
    >
      <div className="flex size-16 items-center justify-center border border-primary/30 bg-transparent">
        {waitingForProcessing ? (
          <Loader2 className="size-8 animate-spin text-primary/70" />
        ) : (
          <BookOpen className="size-8 text-primary/70" />
        )}
      </div>
      <div>
        <p className="text-lg font-semibold tracking-tight">
          {waitingForProcessing ? "No posts yet - still generating" : "No posts for this document"}
        </p>
        <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-muted-foreground">
          {waitingForProcessing
            ? "Scrollect is still turning this document into learning posts."
            : "There are no ready posts for this document yet."}
        </p>
      </div>
      {document && (
        <div className="flex flex-col items-center gap-2">
          <p className="max-w-sm break-words text-xs text-muted-foreground">{document.title}</p>
          <StatusBadge status={document.status} />
        </div>
      )}
    </div>
  );
}

interface UnknownScopeStateProps {
  scope: "topic" | "document";
}

function UnknownScopeState({ scope }: UnknownScopeStateProps) {
  const isTopic = scope === "topic";
  return (
    <div
      data-testid={isTopic ? "feed-unknown-topic-state" : "feed-unknown-document-state"}
      className="mt-12 flex flex-col items-center gap-5 px-4 text-center"
    >
      <div className="flex size-16 items-center justify-center border border-primary/30 bg-transparent">
        {isTopic ? (
          <Rss className="size-8 text-primary/70" />
        ) : (
          <BookOpen className="size-8 text-primary/70" />
        )}
      </div>
      <div>
        <p className="text-lg font-semibold tracking-tight">
          {isTopic ? "Unknown topic" : "Unknown document"}
        </p>
        <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-muted-foreground">
          {isTopic
            ? "This topic doesn't exist or you don't have access to it."
            : "This document doesn't exist or you don't have access to it."}
        </p>
      </div>
      <Button
        render={<Link to="/app/feed" />}
        variant="outline"
        data-testid="feed-unknown-scope-back"
      >
        Back to feed
      </Button>
    </div>
  );
}

interface TopicFeedEmptyStateProps {
  topicName: string | undefined;
  reason: "no_drafts" | "processing" | null;
}

function TopicFeedEmptyState({ topicName, reason }: TopicFeedEmptyStateProps) {
  const waitingForProcessing = reason === "processing";

  return (
    <div
      data-testid="feed-topic-empty-state"
      className="mt-12 flex flex-col items-center gap-5 px-4 text-center"
    >
      <div className="flex size-16 items-center justify-center border border-primary/30 bg-transparent">
        {waitingForProcessing ? (
          <Loader2 className="size-8 animate-spin text-primary/70" />
        ) : (
          <Rss className="size-8 text-primary/70" />
        )}
      </div>
      <div>
        <p className="text-lg font-semibold tracking-tight">
          {waitingForProcessing ? "No posts yet - still generating" : "No posts for this topic"}
        </p>
        <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-muted-foreground">
          {waitingForProcessing
            ? "Scrollect is still preparing posts for this topic."
            : "Assign documents to this topic from your library, then generate to populate the feed."}
        </p>
      </div>
      {topicName && (
        <p className="max-w-sm break-words text-xs text-muted-foreground">{topicName}</p>
      )}
      {!waitingForProcessing && (
        <Button render={<Link to="/app/library" />} data-testid="feed-topic-empty-library-cta">
          <Library className="size-4" data-icon="inline-start" />
          Go to library
        </Button>
      )}
    </div>
  );
}

interface FeedEmptyStateProps {
  reason: "no_drafts" | "processing" | null;
  onServe: () => void;
  serving: boolean;
}

function FeedEmptyState({ reason, onServe, serving }: FeedEmptyStateProps) {
  if (reason === "processing") {
    return (
      <div
        data-testid="feed-processing-state"
        className="mt-12 flex flex-col items-center gap-5 text-center"
      >
        <div className="relative flex size-16 items-center justify-center border border-amber-500/30 bg-transparent">
          <Timer className="size-8 text-amber-600/70 dark:text-amber-400/70" />
          <span className="absolute -right-1 -top-1 flex size-5 items-center justify-center border border-border bg-card">
            <Loader2 className="size-3 animate-spin text-amber-600 dark:text-amber-400" />
          </span>
        </div>
        <div>
          <p className="text-lg font-semibold tracking-tight">Your documents are being processed</p>
          <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-muted-foreground">
            Learning posts will appear here once processing completes. This usually takes a few
            minutes.
          </p>
        </div>
        <p className="text-xs text-muted-foreground/60">
          Processing continues in the background - you can close the app and come back later.
        </p>
      </div>
    );
  }

  if (reason === "no_drafts") {
    return (
      <div
        data-testid="feed-empty-state"
        className="mt-12 flex flex-col items-center gap-5 text-center"
      >
        <div className="flex size-16 items-center justify-center border border-primary/30 bg-transparent">
          <FileUp className="size-8 text-primary/70" />
        </div>
        <div>
          <p className="text-lg font-semibold tracking-tight">No content yet</p>
          <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-muted-foreground">
            Upload books, articles, or videos to your library. We&apos;ll generate bite-sized
            learning posts from them automatically.
          </p>
        </div>
        <Button render={<Link to="/app/upload" />} data-testid="feed-upload-cta">
          <FileUp className="size-4" data-icon="inline-start" />
          Upload your first content
        </Button>
      </div>
    );
  }

  return (
    <div
      data-testid="feed-empty-state"
      className="mt-12 flex flex-col items-center gap-5 text-center"
    >
      <div className="flex size-16 items-center justify-center border border-primary/30 bg-transparent">
        <Rss className="size-8 text-primary/70" />
      </div>
      <div>
        <p className="text-lg font-semibold tracking-tight">No posts yet</p>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
          Click &quot;Generate&quot; to create learning posts from your documents.
        </p>
      </div>
      <Button onClick={onServe} disabled={serving} data-testid="feed-serve-button">
        <Sparkles className="size-4" data-icon="inline-start" />
        Generate your first feed
      </Button>
    </div>
  );
}
