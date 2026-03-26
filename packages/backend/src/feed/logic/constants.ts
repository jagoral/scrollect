export const UNGROUPED_SENTINEL = "(ungrouped)";

export const MAX_CONSECUTIVE_SAME_TYPE = 3;

export const FRESHNESS_WINDOW_MS = 48 * 60 * 60 * 1000;
export const FRESHNESS_BOOST_FACTOR = 2.0;
export const FRESHNESS_DECAY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export const HIGHLIGHT_BOOST = 3.0;

export const REACTION_NOT_INTERESTING_MULTIPLIER = 0.3;
export const REACTION_ALREADY_KNOW_MULTIPLIER = 0.1;
export const REACTION_WRONG_TYPE_MULTIPLIER = 0.5;
export const REACTION_LIKE_SECTION_MULTIPLIER = 1.3;
export const REACTION_LIKE_CARD_TYPE_MULTIPLIER = 1.15;

export const SECTION_DIVERSITY_CAP = 0.25;

/** Short highlights (< 20 chars) produce too many false substring matches against chunk content */
export const MIN_HIGHLIGHT_MATCH_LENGTH = 20;

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
