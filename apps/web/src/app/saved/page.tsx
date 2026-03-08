"use client";

import { api } from "@scrollect/backend/convex/_generated/api";
import { Authenticated, AuthLoading, Unauthenticated, usePaginatedQuery } from "convex/react";

import { Bookmark, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { PostCard } from "@/components/post-card";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";
import { Skeleton } from "@/components/ui/skeleton";

function SavedSkeleton() {
  return (
    <div className="container mx-auto max-w-2xl px-4 py-8 md:px-6">
      <div className="mb-8">
        <Skeleton className="h-8 w-20" />
        <Skeleton className="mt-2 h-4 w-52" />
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

function SavedContent() {
  const { results, status, loadMore } = usePaginatedQuery(
    api.bookmarks.listSaved,
    {},
    { initialNumItems: 10 },
  );

  const sentinelRef = useInfiniteScroll(status, loadMore);

  if (status === "LoadingFirstPage") {
    return <SavedSkeleton />;
  }

  return (
    <div className="container mx-auto max-w-2xl px-4 py-8 md:px-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Saved</h1>
        <p className="mt-1 text-sm text-muted-foreground">Your bookmarked learning cards.</p>
      </div>

      {results.length === 0 ? (
        <div className="mt-12 flex flex-col items-center gap-4 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/10 to-muted ring-1 ring-primary/10">
            <Bookmark className="h-8 w-8 text-muted-foreground" />
          </div>
          <div>
            <p className="text-lg font-semibold">No saved posts yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Save cards from your feed to find them here.
            </p>
          </div>
        </div>
      ) : (
        <div className="animate-stagger-in grid gap-4">
          {results.map((bookmark) => {
            if (!bookmark.post) return null;
            return (
              <PostCard
                key={bookmark._id}
                post={{
                  _id: bookmark.post._id,
                  content: bookmark.post.content,
                  sourceDocumentTitle: bookmark.post.sourceDocumentTitle,
                  createdAt: bookmark.post.createdAt,
                  reaction: bookmark.post.reaction,
                  isBookmarked: true,
                }}
              />
            );
          })}

          {/* Sentinel for infinite scroll */}
          <div ref={sentinelRef} className="h-1" />

          {status === "LoadingMore" && (
            <div className="flex animate-in fade-in justify-center py-4">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {status === "Exhausted" && results.length > 0 && (
            <div className="flex flex-col items-center gap-2 py-8 text-center text-muted-foreground">
              <p className="text-sm font-medium">You&apos;ve seen all your saved posts</p>
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

export default function SavedPage() {
  return (
    <>
      <Authenticated>
        <SavedContent />
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
