import { useCallback, useEffect, useRef, useState } from "react";

const DEFAULT_FLOOR_MS = 300;

/**
 * Manage a pull-to-refresh spinner with a minimum visible duration. Convex
 * paginated queries deliver fresh data over WebSocket, so we don't actually
 * re-fetch on refresh — we just hold the spinner up for `floorMs` so the
 * gesture feels intentional rather than dismissed instantly.
 */
export function useRefreshSpinnerFloor(floorMs: number = DEFAULT_FLOOR_MS) {
  const [refreshing, setRefreshing] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear any pending timer if the screen unmounts mid-gesture — leaving it
  // pending would trigger a state update on an unmounted hook.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const trigger = useCallback(() => {
    setRefreshing(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setRefreshing(false);
      timerRef.current = null;
    }, floorMs);
  }, [floorMs]);

  return { refreshing, trigger };
}
