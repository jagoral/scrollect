import { api } from "@scrollect/backend/convex/_generated/api";
import type { Id } from "@scrollect/backend/convex/_generated/dataModel";
import { usePaginatedQuery } from "convex/react";
import { usePostHog } from "posthog-react-native";
import { useCallback, useEffect, useRef } from "react";

import { useRefreshSpinnerFloor } from "./use-refresh-spinner-floor";

const INITIAL_PAGE_SIZE = 10;
const LOAD_MORE_PAGE_SIZE = 10;

interface UseFeedOptions {
  topicId?: Id<"topics">;
}

export function useFeed({ topicId }: UseFeedOptions = {}) {
  const posthog = usePostHog();
  const { results, status, loadMore } = usePaginatedQuery(
    api.feed.queries.list,
    topicId ? { topicId } : {},
    { initialNumItems: INITIAL_PAGE_SIZE },
  );
  const { refreshing, trigger: triggerRefreshFloor } = useRefreshSpinnerFloor();

  const onRefresh = useCallback(() => {
    // A refresh gesture during LoadingMore / LoadingFirstPage is intentionally
    // a no-op — the spinner already conveys "data in flight". Stacking another
    // pull-to-refresh on top would only confuse the user.
    if (status === "LoadingFirstPage" || status === "LoadingMore" || refreshing) return;
    triggerRefreshFloor();
    posthog?.capture("feed.refreshed", topicId ? { scope: "topic", topic_id: topicId } : undefined);
  }, [posthog, refreshing, status, topicId, triggerRefreshFloor]);

  const onEndReached = useCallback(() => {
    if (status !== "CanLoadMore") return;
    posthog?.capture("feed.paginated", {
      loaded_count: results.length,
      ...(topicId ? { scope: "topic", topic_id: topicId } : {}),
    });
    loadMore(LOAD_MORE_PAGE_SIZE);
  }, [loadMore, posthog, results.length, status, topicId]);

  // Fire `feed.exhausted` exactly once per mount. Stricter than web (web's
  // `prevStatusRef` re-fires on every transition INTO Exhausted across
  // load-more cycles), but a once-per-session signal is more useful for
  // analytics and avoids double-counting when the feed shrinks and grows.
  const exhaustedFiredRef = useRef(false);
  useEffect(() => {
    if (status !== "Exhausted") return;
    if (exhaustedFiredRef.current) return;
    exhaustedFiredRef.current = true;
    posthog?.capture("feed.exhausted", {
      total_posts: results.length,
      ...(topicId ? { scope: "topic", topic_id: topicId } : {}),
    });
  }, [posthog, results.length, status, topicId]);

  return {
    results,
    status,
    refreshing,
    onRefresh,
    onEndReached,
  };
}
