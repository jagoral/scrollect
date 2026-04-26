import * as Haptics from "expo-haptics";

// Mobile feel parity with web: a like/bookmark commit feels like a "tap",
// a dislike (which removes the post) feels like a heavier negative confirm.
// Errors thrown by Haptics on platforms without a haptic engine are swallowed
// — haptics are an enhancement, never a hard dependency.
function safe(fn: () => Promise<unknown>) {
  void fn().catch(() => {});
}

export const haptics = {
  selection() {
    safe(Haptics.selectionAsync);
  },
  reactionLike() {
    safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
  },
  reactionDislike() {
    safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
  },
  bookmark() {
    safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
  },
};
