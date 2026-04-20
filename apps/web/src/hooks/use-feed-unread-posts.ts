import { useCallback, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "scrollect.feed.unreadPostBatches.v1";
const MAX_BATCH_AGE_MS = 7 * 24 * 60 * 60 * 1000;

type FeedUnreadStore = Record<string, FeedUnreadEntry>;

type FeedUnreadEntry = {
  postIds: string[];
  createdAt: number;
};

function readStore(): FeedUnreadStore {
  if (typeof window === "undefined") return {};

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return pruneStore(parsed, Date.now());
  } catch {
    return {};
  }
}

function writeStore(store: FeedUnreadStore) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Browsing the feed should keep working even if storage is unavailable.
  }
}

function isValidEntry(value: unknown): value is FeedUnreadEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<FeedUnreadEntry>;
  return Array.isArray(entry.postIds) && typeof entry.createdAt === "number";
}

export function pruneStore(value: unknown, now: number): FeedUnreadStore {
  if (!value || typeof value !== "object") return {};

  const store: FeedUnreadStore = {};
  for (const [scopeKey, entry] of Object.entries(value)) {
    if (!isValidEntry(entry)) continue;
    if (now - entry.createdAt > MAX_BATCH_AGE_MS) continue;

    const postIds = uniquePostIds(entry.postIds);
    if (postIds.length === 0) continue;
    store[scopeKey] = { postIds, createdAt: entry.createdAt };
  }

  return store;
}

export function uniquePostIds(postIds: string[]) {
  return [...new Set(postIds.filter(Boolean))];
}

export function mergeUnreadPostIds(currentIds: string[], nextIds: string[]) {
  return uniquePostIds([...nextIds, ...currentIds]);
}

export function useFeedUnreadPosts(scopeKey: string) {
  const [store, setStore] = useState<FeedUnreadStore>(() => readStore());
  const activeEntry = store[scopeKey];
  const unreadPostIds = activeEntry?.postIds ?? [];
  const unreadPostIdSet = useMemo(() => new Set(unreadPostIds), [unreadPostIds]);

  useEffect(() => {
    writeStore(store);
  }, [store]);

  const registerBatch = useCallback(
    (postIds: string[]) => {
      const nextIds = uniquePostIds(postIds);
      if (nextIds.length === 0) return;

      setStore((current) => {
        const existing = current[scopeKey]?.postIds ?? [];
        return {
          ...current,
          [scopeKey]: {
            postIds: mergeUnreadPostIds(existing, nextIds),
            createdAt: Date.now(),
          },
        };
      });
    },
    [scopeKey],
  );

  const clearBatch = useCallback(() => {
    setStore((current) => {
      if (!current[scopeKey]) return current;

      const { [scopeKey]: _removed, ...rest } = current;
      return rest;
    });
  }, [scopeKey]);

  const markBatchSeenForPost = useCallback(
    (postId: string) => {
      if (!unreadPostIdSet.has(postId)) return;
      clearBatch();
    },
    [clearBatch, unreadPostIdSet],
  );

  return {
    firstUnreadPostId: unreadPostIds[0],
    unreadCount: unreadPostIds.length,
    unreadPostIdSet,
    registerBatch,
    clearBatch,
    markBatchSeenForPost,
  };
}
