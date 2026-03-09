"use client";

import { api } from "@scrollect/backend/convex/_generated/api";
import { usePaginatedQuery } from "convex/react";
import { Bookmark, Loader2 } from "lucide-react";

import { PostCard } from "@/components/post-card";
import { Skeleton } from "@/components/ui/skeleton";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";

export function SavedContent() {
  const { results, status, loadMore } = usePaginatedQuery(
    api.bookmarks.listSaved,
    {},
    { initialNumItems: 10 },
  );

  const sentinelRef = useInfiniteScroll(status, loadMore);

  if (status === "LoadingFirstPage") {
    return (
      <div className="container mx-auto max-w-2xl px-4 py-8 md:px-6">
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight">Saved</h1>
          <p className="mt-1 text-muted-foreground">Your bookmarked learning cards.</p>
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
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Saved</h1>
        <p className="mt-1 text-sm text-muted-foreground">Your bookmarked learning cards.</p>
      </div>

      {results.length === 0 ? (
        <div className="mt-12 flex flex-col items-center gap-4 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/10">
            <Bookmark className="h-8 w-8 text-primary/70" />
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
                  sourceChunkId: bookmark.post.sourceChunkId,
                  sourceDocumentId: bookmark.post.sourceDocumentId,
                  sectionTitle: bookmark.post.sectionTitle,
                  pageNumber: bookmark.post.pageNumber,
                  chunkIndex: bookmark.post.chunkIndex,
                }}
              />
            );
          })}

          {/* Sentinel for infinite scroll */}
          <div ref={sentinelRef} className="h-1" />

          {status === "LoadingMore" && (
            <div className="flex justify-center py-4 animate-in fade-in duration-300">
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
