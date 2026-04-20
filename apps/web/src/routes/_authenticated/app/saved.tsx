import { createFileRoute } from "@tanstack/react-router";
import { api } from "@scrollect/backend/convex/_generated/api";
import { usePaginatedQuery } from "convex/react";
import { Bookmark, Loader2 } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Post } from "@/components/posts";
import { Skeleton } from "@/components/ui/skeleton";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";

export const Route = createFileRoute("/_authenticated/app/saved")({
  ssr: false,
  head: () => ({
    meta: [{ title: "Saved | Scrollect" }],
  }),
  component: SavedPage,
});

function SavedPage() {
  const { results, status, loadMore } = usePaginatedQuery(
    api.content.bookmarks.listSaved,
    {},
    { initialNumItems: 10 },
  );

  const sentinelRef = useInfiniteScroll(status, loadMore);

  if (status === "LoadingFirstPage") {
    return (
      <div className="pb-6">
        <PageHeader
          eyebrow="Bookmarks"
          title="Saved"
          description="Your bookmarked learning posts."
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

  return (
    <div className="pb-6">
      <PageHeader eyebrow="Bookmarks" title="Saved" description="Your bookmarked learning posts." />

      {results.length === 0 ? (
        <div className="mt-16 flex flex-col items-center gap-5 text-center">
          <div className="flex size-16 items-center justify-center border border-primary/30 bg-transparent">
            <Bookmark className="size-7 text-primary/60" />
          </div>
          <div>
            <p className="text-lg font-semibold tracking-tight">No saved posts yet</p>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Save posts from your feed to find them here.
            </p>
          </div>
        </div>
      ) : (
        <div className="animate-stagger-in">
          <div className="border-b border-border">
            {results.map((bookmark) => {
              if (!bookmark.post) return null;
              return (
                <Post
                  key={bookmark._id}
                  post={{
                    ...bookmark.post,
                    isBookmarked: true,
                  }}
                />
              );
            })}
          </div>

          <div ref={sentinelRef} className="h-1" />

          {status === "LoadingMore" && (
            <div className="flex justify-center py-4 animate-in fade-in duration-300">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {status === "Exhausted" && results.length > 0 && (
            <div className="flex flex-col items-center gap-3 py-10 text-center text-muted-foreground">
              <div className="h-px w-16 bg-border" />
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em]">
                You&apos;ve seen all your saved posts
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
