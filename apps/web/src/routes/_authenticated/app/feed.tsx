import { api } from "@scrollect/backend/convex/_generated/api";
import type { Id } from "@scrollect/backend/convex/_generated/dataModel";
import { Link, createFileRoute } from "@tanstack/react-router";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useMutation, usePaginatedQuery } from "convex/react";
import { CheckCircle, FileUp, Loader2, Rss, Sparkles, Timer } from "lucide-react";
import { usePostHog } from "posthog-js/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { PostCard } from "@/components/post-card";
import { buildTagMap } from "@/components/tags";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";

type FeedSearch = {
  noAutoServe?: boolean;
};

export const Route = createFileRoute("/_authenticated/app/feed")({
  ssr: false,
  head: () => ({
    meta: [{ title: "Feed | Scrollect" }],
  }),
  validateSearch: (search: Record<string, unknown>): FeedSearch => ({
    noAutoServe:
      search.noAutoServe === true ||
      search.noAutoServe === "true" ||
      search.noAutoServe === "" ||
      search.noAutoGenerate === true ||
      search.noAutoGenerate === "true" ||
      search.noAutoGenerate === "",
  }),
  component: FeedPage,
});

function FeedPage() {
  const { noAutoServe } = Route.useSearch();

  const { results, status, loadMore } = usePaginatedQuery(
    api.feed.queries.list,
    {},
    { initialNumItems: 10 },
  );
  const serveFeed = useMutation(api.feed.serving.serveFeed);

  const [serving, setServing] = useState(false);
  const [serveReason, setServeReason] = useState<"no_drafts" | "processing" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const autoServedRef = useRef(false);

  const posthog = usePostHog();

  const servingRef = useRef(false);

  const serve = useCallback(async () => {
    if (servingRef.current) return;
    servingRef.current = true;
    setServing(true);
    setError(null);
    setServeReason(null);
    try {
      const result = await serveFeed({});
      posthog.capture("feed.served", {
        card_count: result.posts.length,
        reason: result.reason ?? null,
      });
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
  }, [serveFeed, posthog]);

  useEffect(() => {
    if (noAutoServe) return;
    if (autoServedRef.current) return;
    if (status === "LoadingFirstPage") return;
    if (results.length > 0) return;

    autoServedRef.current = true;
    serve();
  }, [noAutoServe, status, results.length, serve]);

  const handleServe = useCallback(() => {
    posthog.capture("feed.serve_clicked", { existing_card_count: results.length });
    serve();
  }, [posthog, serve, results.length]);

  const sentinelRef = useInfiniteScroll(status, loadMore);

  const docIdKey = results.map((p) => p.primarySourceDocumentId).join(",");
  const uniqueDocumentIds = useMemo(
    () => [...new Set(results.map((p) => p.primarySourceDocumentId))] as Id<"documents">[],
    [docIdKey], // eslint-disable-line react-hooks/exhaustive-deps -- stabilized via serialized key
  );

  const { data: tagsBatch } = useQuery(
    convexQuery(
      api.tags.getDocumentTagsBatch,
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

  const exhaustedTracked = useRef(false);
  useEffect(() => {
    if (status === "Exhausted" && !exhaustedTracked.current) {
      exhaustedTracked.current = true;
      posthog.capture("feed.exhausted", { total_cards: enrichedResults.length });
    }
    if (status !== "Exhausted") {
      exhaustedTracked.current = false;
    }
  }, [status, posthog]); // eslint-disable-line react-hooks/exhaustive-deps -- enrichedResults.length intentionally omitted; we only fire when status changes

  if (status === "LoadingFirstPage") {
    return (
      <div className="container mx-auto max-w-2xl px-4 py-8 md:px-6">
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight">Feed</h1>
          <p className="mt-1 text-muted-foreground">Your AI-generated learning cards.</p>
        </div>
        <div className="grid gap-4">
          <Skeleton className="h-36 w-full rounded-xl" />
          <Skeleton className="h-36 w-full rounded-xl" />
          <Skeleton className="h-36 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-2xl px-4 py-8 md:px-6">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Feed</h1>
          <p className="mt-1 text-sm text-muted-foreground">Your AI-generated learning cards.</p>
        </div>
        <Button onClick={handleServe} disabled={serving} size="sm" data-testid="feed-serve-button">
          {serving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="mr-2 h-4 w-4" />
          )}
          Generate
        </Button>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {enrichedResults.length === 0 && !serving ? (
        <FeedEmptyState reason={serveReason} onServe={handleServe} serving={serving} />
      ) : (
        <div className="animate-stagger-in grid gap-4">
          {enrichedResults.map((post) => (
            <PostCard key={post._id} post={post} />
          ))}

          <div ref={sentinelRef} className="h-1" />

          {status === "LoadingMore" && (
            <div className="flex justify-center py-4 animate-in fade-in duration-300">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {status === "Exhausted" && enrichedResults.length > 0 && (
            <div
              data-testid="feed-end-state"
              className="flex flex-col items-center gap-2 py-8 text-center text-muted-foreground"
            >
              <div className="mb-2 flex items-center gap-4">
                <div className="h-px w-16 bg-gradient-to-r from-transparent to-border" />
                <CheckCircle className="h-5 w-5" />
                <div className="h-px w-16 bg-gradient-to-l from-transparent to-border" />
              </div>
              <p className="text-sm font-medium">You&apos;re all caught up</p>
            </div>
          )}
        </div>
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
        className="mt-12 flex flex-col items-center gap-4 text-center"
      >
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500/15 to-amber-500/5 ring-1 ring-amber-500/10">
          <Timer className="h-8 w-8 text-amber-500/70" />
        </div>
        <div>
          <p className="text-lg font-semibold">Your documents are being processed</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Learning cards will appear here once processing completes. This usually takes a few
            minutes.
          </p>
        </div>
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (reason === "no_drafts") {
    return (
      <div
        data-testid="feed-empty-state"
        className="mt-12 flex flex-col items-center gap-4 text-center"
      >
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/10">
          <FileUp className="h-8 w-8 text-primary/70" />
        </div>
        <div>
          <p className="text-lg font-semibold">No content yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Upload documents to your library and we&apos;ll generate learning cards from them.
          </p>
        </div>
        <Button render={<Link to="/app/library" />} data-testid="feed-upload-cta">
          <FileUp className="mr-2 h-4 w-4" />
          Go to Library
        </Button>
      </div>
    );
  }

  return (
    <div
      data-testid="feed-empty-state"
      className="mt-12 flex flex-col items-center gap-4 text-center"
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/10">
        <Rss className="h-8 w-8 text-primary/70" />
      </div>
      <div>
        <p className="text-lg font-semibold">No posts yet</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Click &quot;Generate&quot; to create learning cards from your documents.
        </p>
      </div>
      <Button onClick={onServe} disabled={serving} data-testid="feed-serve-button">
        <Sparkles className="mr-2 h-4 w-4" />
        Generate your first feed
      </Button>
    </div>
  );
}
