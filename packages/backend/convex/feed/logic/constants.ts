import type { PostType } from "../../lib/validators";

export const HOOK_CARD_TYPES: readonly PostType[] = ["quiz", "connection"];
export const MAX_CONSECUTIVE_SAME_TYPE = 3;

export const FRESHNESS_WINDOW_MS = 48 * 60 * 60 * 1000;
export const FRESHNESS_BOOST_FACTOR = 2.0;
export const FRESHNESS_DECAY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export function computeRecencyBoost(docCreatedAt: number, now: number): number {
  const age = now - docCreatedAt;
  if (age < FRESHNESS_WINDOW_MS) return FRESHNESS_BOOST_FACTOR;
  if (age < FRESHNESS_DECAY_WINDOW_MS) {
    return (
      1.0 +
      ((FRESHNESS_BOOST_FACTOR - 1.0) * (FRESHNESS_DECAY_WINDOW_MS - age)) /
        (FRESHNESS_DECAY_WINDOW_MS - FRESHNESS_WINDOW_MS)
    );
  }
  return 1.0;
}
