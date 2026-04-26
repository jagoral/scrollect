import { api } from "@scrollect/backend/convex/_generated/api";
import { usePaginatedQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { usePostHog } from "posthog-react-native";
import { useCallback, useEffect, useRef } from "react";

import type { FeedPost } from "@/components/feed/types";

import { useRefreshSpinnerFloor } from "./use-refresh-spinner-floor";

const INITIAL_PAGE_SIZE = 10;
const LOAD_MORE_PAGE_SIZE = 10;

type SavedListResult = FunctionReturnType<typeof api.content.bookmarks.listSaved>;
type SavedBookmark = SavedListResult["page"][number];
type SavedBookmarkPost = NonNullable<SavedBookmark["post"]>;

// Compile-time check: the saved-bookmark post shape, plus the two enrichment
// fields we add, must be assignable to FeedPost. If `feed.queries.list` adds a
// new field that `bookmarks.listSaved` doesn't produce, this type errors and
// the build breaks — instead of silently producing a degraded FeedPost.
type Assert<T extends true> = T;
type _AssertSavedAdaptableToFeed = Assert<
  SavedBookmarkPost & { isBookmarked: true; isNew: boolean } extends FeedPost ? true : false
>;

export function useSaved() {
  const posthog = usePostHog();
  const { results, status, loadMore } = usePaginatedQuery(
    api.content.bookmarks.listSaved,
    {},
    { initialNumItems: INITIAL_PAGE_SIZE },
  );

  const { refreshing, trigger: triggerRefreshFloor } = useRefreshSpinnerFloor();

  const onRefresh = useCallback(() => {
    if (status === "LoadingFirstPage" || status === "LoadingMore" || refreshing) return;
    triggerRefreshFloor();
  }, [refreshing, status, triggerRefreshFloor]);

  const onEndReached = useCallback(() => {
    if (status !== "CanLoadMore") return;
    loadMore(LOAD_MORE_PAGE_SIZE);
  }, [loadMore, status]);

  // Adapt the saved-bookmark shape to FeedPost so PostCard can render it.
  // listSaved doesn't enrich `isBookmarked` (every entry here is bookmarked
  // by definition) or `isNew`, so we add those defaults.
  const posts: ReadonlyArray<FeedPost> = results
    .filter(
      (bookmark): bookmark is SavedBookmark & { post: SavedBookmarkPost } => bookmark.post !== null,
    )
    .map((bookmark) => ({
      ...bookmark.post,
      isBookmarked: true as const,
      isNew: false,
    }));

  const viewedFiredRef = useRef(false);
  useEffect(() => {
    if (status === "LoadingFirstPage") return;
    if (viewedFiredRef.current) return;
    viewedFiredRef.current = true;
    posthog?.capture("saved_viewed", { post_count: posts.length });
  }, [posthog, posts.length, status]);

  return {
    posts,
    status,
    refreshing,
    onRefresh,
    onEndReached,
  };
}
