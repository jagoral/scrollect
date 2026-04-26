import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_PREFIX = "scrollect.push.";

const KEYS = {
  hasBeenPrompted: `${STORAGE_PREFIX}hasBeenPrompted`,
  reactionCount: `${STORAGE_PREFIX}reactionCount`,
} as const;

/**
 * Reaction-count and "has been prompted" state are device-scoped (not user-scoped).
 * Sign-out / sign-in by a different user on the same device must clear them via
 * `clearPushPromptState()` to avoid the new user inheriting the previous one's
 * decision. The auth flow is responsible for that call.
 */

/**
 * Concurrent reactions arriving in quick succession (e.g. user taps two cards in
 * the same animation frame) would race a naive read-modify-write through
 * AsyncStorage and lose increments. Serialise all writes on a single in-memory
 * promise so the count is monotonic per app process.
 */
let storageQueue: Promise<unknown> = Promise.resolve();
function enqueue<T>(work: () => Promise<T>): Promise<T> {
  const next = storageQueue.then(work, work);
  storageQueue = next.catch(() => undefined);
  return next;
}

export async function getHasBeenPrompted(): Promise<boolean> {
  const value = await AsyncStorage.getItem(KEYS.hasBeenPrompted);
  return value === "true";
}

export async function setHasBeenPrompted(): Promise<void> {
  await enqueue(async () => {
    await AsyncStorage.setItem(KEYS.hasBeenPrompted, "true");
  });
}

export function incrementReactionCount(): Promise<number> {
  return enqueue(async () => {
    const raw = await AsyncStorage.getItem(KEYS.reactionCount);
    const current = raw ? Number.parseInt(raw, 10) : 0;
    const next = (Number.isFinite(current) ? current : 0) + 1;
    await AsyncStorage.setItem(KEYS.reactionCount, String(next));
    return next;
  });
}

/**
 * Reset every push-related flag. Called on sign-out so the next user on the same
 * device sees the soft pre-prompt and reaction-count flow from a clean slate.
 */
export async function clearPushPromptState(): Promise<void> {
  await enqueue(async () => {
    await Promise.all([
      AsyncStorage.removeItem(KEYS.hasBeenPrompted),
      AsyncStorage.removeItem(KEYS.reactionCount),
    ]);
  });
}
