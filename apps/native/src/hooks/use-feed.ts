import { api } from "@scrollect/backend/convex/_generated/api";
import { usePaginatedQuery } from "convex/react";
import { usePostHog } from "posthog-react-native";
import { useCallback, useEffect, useRef, useState } from "react";

const INITIAL_PAGE_SIZE = 10;
const LOAD_MORE_PAGE_SIZE = 10;
const REFRESH_SPINNER_FLOOR_MS = 300;

export function useFeed() {
  const posthog = usePostHog();
  const { results, status, loadMore } = usePaginatedQuery(
    api.feed.queries.list,
    {},
    { initialNumItems: INITIAL_PAGE_SIZE },
  );

  const [refreshing, setRefreshing] = useState(false);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear any pending refresh-spinner timer if the screen unmounts mid-gesture
  // — leaving it pending would trigger a state update on an unmounted hook.
  useEffect(() => {
    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, []);

  const onRefresh = useCallback(() => {
    // A refresh gesture during LoadingMore / LoadingFirstPage is intentionally
    // a no-op — the spinner already conveys "data in flight". Stacking another
    // pull-to-refresh on top would only confuse the user.
    if (status === "LoadingFirstPage" || status === "LoadingMore" || refreshing) return;
    setRefreshing(true);
    posthog?.capture("feed.refreshed");
    // The Convex paginated query subscribes via WebSocket, so data is already
    // live — we don't need to manually re-fetch. The spinner stays up for a
    // short floor so the gesture feels intentional rather than dismissed
    // instantly.
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => {
      setRefreshing(false);
      refreshTimerRef.current = null;
    }, REFRESH_SPINNER_FLOOR_MS);
  }, [posthog, refreshing, status]);

  const onEndReached = useCallback(() => {
    if (status !== "CanLoadMore") return;
    posthog?.capture("feed.paginated", {
      loaded_count: results.length,
    });
    loadMore(LOAD_MORE_PAGE_SIZE);
  }, [loadMore, posthog, results.length, status]);

  // Fire `feed.exhausted` exactly once per mount. Stricter than web (web's
  // `prevStatusRef` re-fires on every transition INTO Exhausted across
  // load-more cycles), but a once-per-session signal is more useful for
  // analytics and avoids double-counting when the feed shrinks and grows.
  const exhaustedFiredRef = useRef(false);
  useEffect(() => {
    if (status !== "Exhausted") return;
    if (exhaustedFiredRef.current) return;
    exhaustedFiredRef.current = true;
    posthog?.capture("feed.exhausted", { total_posts: results.length });
  }, [posthog, results.length, status]);

  return {
    results,
    status,
    refreshing,
    onRefresh,
    onEndReached,
  };
}
