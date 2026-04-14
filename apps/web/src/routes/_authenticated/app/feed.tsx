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
    posthog.capture("feed.serve_clicked", {
      existing_card_count: results.length,
    });
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
      posthog.capture("feed.exhausted", {
        total_cards: enrichedResults.length,
      });
    }
    if (status !== "Exhausted") {
      exhaustedTracked.current = false;
    }
  }, [status, posthog]); // eslint-disable-line react-hooks/exhaustive-deps -- enrichedResults.length intentionally omitted; we only fire when status changes

  if (status === "LoadingFirstPage") {
    return (
      <div className="py-6">
        <div className="mb-6 px-4 md:px-6">
          <h1 className="text-2xl font-bold tracking-tight">Feed</h1>
          <p className="mt-1 text-sm text-muted-foreground">Your AI-generated learning cards.</p>
        </div>
        <div className="border-y border-border">
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

  return (
    <div className="py-6">
      <div className="mb-6 flex items-center justify-between px-4 md:px-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Feed</h1>
          <p className="mt-1 text-sm text-muted-foreground">Your AI-generated learning cards.</p>
        </div>
        <Button onClick={handleServe} disabled={serving} data-testid="feed-serve-button">
          {serving ? (
            <Loader2 className="size-4 animate-spin" data-icon="inline-start" />
          ) : (
            <Sparkles className="size-4" data-icon="inline-start" />
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
        <div className="animate-stagger-in">
          <div className="border-y border-border">
            {enrichedResults.map((post) => (
              <PostCard key={post._id} post={post} />
            ))}
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
                  Generate more cards to keep learning.
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
            Learning cards will appear here once processing completes. This usually takes a few
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
            learning cards from them automatically.
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
          Click &quot;Generate&quot; to create learning cards from your documents.
        </p>
      </div>
      <Button onClick={onServe} disabled={serving} data-testid="feed-serve-button">
        <Sparkles className="size-4" data-icon="inline-start" />
        Generate your first feed
      </Button>
    </div>
  );
}
