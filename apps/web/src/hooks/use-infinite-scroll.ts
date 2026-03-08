import { useEffect, useRef } from "react";

/**
 * Observes a sentinel element and calls loadMore when it becomes visible.
 * Uses refs internally so the IntersectionObserver is created once (stable subscription).
 */
export function useInfiniteScroll(
  status: "LoadingFirstPage" | "CanLoadMore" | "LoadingMore" | "Exhausted",
  loadMore: (numItems: number) => void,
  itemsPerPage = 10,
) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const statusRef = useRef(status);
  const loadMoreRef = useRef(loadMore);
  statusRef.current = status;
  loadMoreRef.current = loadMore;

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && statusRef.current === "CanLoadMore") {
          loadMoreRef.current(itemsPerPage);
        }
      },
      { threshold: 0.1 },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [itemsPerPage]);

  return sentinelRef;
}
