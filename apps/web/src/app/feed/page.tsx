"use client";

import { api } from "@scrollect/backend/convex/_generated/api";
import {
  Authenticated,
  AuthLoading,
  Unauthenticated,
  useAction,
  usePaginatedQuery,
  useQuery,
} from "convex/react";

import { CheckCircle, Loader2, Rss, Sparkles } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";

import { PostCard } from "@/components/post-card";
import { useAutoGenerate } from "@/hooks/use-auto-generate";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

function FeedSkeleton() {
  return (
    <div className="container mx-auto max-w-2xl px-4 py-8 md:px-6">
      <div className="mb-8">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="mt-2 h-4 w-56" />
      </div>
      <div className="animate-stagger-in grid gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border p-5">
            <div className="flex gap-3">
              <div className="w-1 shrink-0 rounded-full skeleton-shimmer" />
              <div className="flex-1 space-y-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-4/5" />
                <Skeleton className="h-4 w-2/3" />
                <div className="flex items-center gap-2 pt-2">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-3 w-16" />
                </div>
                <div className="flex gap-1 pt-1">
                  <Skeleton className="h-8 w-8 rounded-md" />
                  <Skeleton className="h-8 w-8 rounded-md" />
                  <Skeleton className="h-8 w-8 rounded-md" />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FeedContent() {
  const searchParams = useSearchParams();
  const count = searchParams.get("count") ? Number(searchParams.get("count")) : undefined;
  const noAutoGenerate = searchParams.has("noAutoGenerate");

  const { results, status, loadMore } = usePaginatedQuery(
    api.feed.queries.list,
    {},
    { initialNumItems: 10 },
  );
  const lastGeneratedAt = useQuery(api.feed.queries.getLastGeneratedAt);
  const generateFeed = useAction(api.feed.generation.generate);

  const { generating, error, generate } = useAutoGenerate(lastGeneratedAt, generateFeed, {
    disabled: noAutoGenerate,
    count,
  });
  const sentinelRef = useInfiniteScroll(status, loadMore);

  if (status === "LoadingFirstPage") {
    return <FeedSkeleton />;
  }

  return (
    <div className="container mx-auto max-w-2xl px-4 py-8 md:px-6">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Feed</h1>
          <p className="mt-1 text-sm text-muted-foreground">Your AI-generated learning cards.</p>
        </div>
        <Button onClick={generate} disabled={generating} size="sm">
          {generating ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="mr-2 h-4 w-4" />
          )}
          Generate
        </Button>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {results.length === 0 && !generating ? (
        <div className="mt-12 flex flex-col items-center gap-4 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/10 to-muted ring-1 ring-primary/10">
            <Rss className="h-8 w-8 text-muted-foreground" />
          </div>
          <div>
            <p className="text-lg font-semibold">No posts yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Click &quot;Generate&quot; to create learning cards from your documents.
            </p>
          </div>
          <Button onClick={generate} disabled={generating}>
            <Sparkles className="mr-2 h-4 w-4" />
            Generate your first feed
          </Button>
        </div>
      ) : (
        <div className="animate-stagger-in grid gap-4">
          {results.map((post) => (
            <PostCard key={post._id} post={post} />
          ))}

          {/* Sentinel for infinite scroll */}
          <div ref={sentinelRef} className="h-1" />

          {status === "LoadingMore" && (
            <div className="flex animate-in fade-in justify-center py-4">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {status === "Exhausted" && results.length > 0 && (
            <div
              data-testid="feed-end-state"
              className="flex flex-col items-center gap-3 py-8 text-center text-muted-foreground"
            >
              <div className="flex w-full items-center gap-4">
                <div className="h-px flex-1 bg-gradient-to-r from-transparent to-border" />
                <CheckCircle className="h-5 w-5" />
                <div className="h-px flex-1 bg-gradient-to-l from-transparent to-border" />
              </div>
              <p className="text-sm font-medium">You&apos;re all caught up</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function UnauthenticatedRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/signin");
  }, [router]);
  return null;
}

export default function FeedPage() {
  return (
    <>
      <Authenticated>
        <Suspense>
          <FeedContent />
        </Suspense>
      </Authenticated>
      <Unauthenticated>
        <UnauthenticatedRedirect />
      </Unauthenticated>
      <AuthLoading>
        <div className="flex flex-1 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
        </div>
      </AuthLoading>
    </>
  );
}
