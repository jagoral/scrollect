import { useSyncExternalStore } from "react";

const MOBILE_BREAKPOINT = 768;

const mql =
  typeof window !== "undefined"
    ? window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    : null;

function subscribe(callback: () => void) {
  mql!.addEventListener("change", callback);
  return () => mql!.removeEventListener("change", callback);
}

function getSnapshot() {
  return window.innerWidth < MOBILE_BREAKPOINT;
}

function getServerSnapshot() {
  return false;
}

/**
 * SSR-safe mobile breakpoint detection.
 *
 * Server snapshot returns `false` (desktop assumed). Safe when the
 * divergent UI is only rendered after user interaction (e.g., a popover
 * that opens on click). Avoid branching on this value for component
 * trees visible on initial mount - that will cause hydration mismatches.
 */
export function useIsMobile() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
