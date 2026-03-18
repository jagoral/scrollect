import { useEffect, useRef, useState } from "react";

import { getRateLimitMessage, isRateLimitError } from "@/lib/rate-limit-error";

const STALE_THRESHOLD_MS = 3_600_000; // 1 hour

/**
 * Auto-triggers feed generation once on mount if the feed is stale
 * (no posts or oldest post > 1 hour old).
 */
export function useAutoGenerate(
  lastGeneratedAt: number | null | undefined,
  generateFeed: (args: { count?: number }) => Promise<unknown>,
  options?: { disabled?: boolean; count?: number },
) {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rateLimitedUntil, setRateLimitedUntil] = useState<number | null>(null);
  const triggered = useRef(false);

  function handleError(e: unknown) {
    if (isRateLimitError(e)) {
      const msg = getRateLimitMessage(e);
      setError(msg);
      setRateLimitedUntil(Date.now() + e.data.retryAfter);
    } else {
      setError(e instanceof Error ? e.message : "Failed to generate feed");
    }
  }

  useEffect(() => {
    if (options?.disabled) return;
    if (triggered.current) return;
    if (lastGeneratedAt === undefined) return; // still loading

    const isStale = lastGeneratedAt === null || Date.now() - lastGeneratedAt > STALE_THRESHOLD_MS;

    if (isStale) {
      triggered.current = true;
      setGenerating(true);
      setError(null);
      generateFeed(options?.count ? { count: options.count } : {})
        .catch(handleError)
        .finally(() => setGenerating(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handleError uses only stable setters
  }, [lastGeneratedAt, generateFeed, options?.disabled, options?.count]);

  useEffect(() => {
    if (!rateLimitedUntil) return;
    const remaining = rateLimitedUntil - Date.now();
    if (remaining <= 0) {
      setRateLimitedUntil(null);
      setError(null);
      return;
    }
    const timer = setTimeout(() => {
      setRateLimitedUntil(null);
      setError(null);
    }, remaining);
    return () => clearTimeout(timer);
  }, [rateLimitedUntil]);

  async function manualGenerate() {
    setGenerating(true);
    setError(null);
    try {
      await generateFeed(options?.count ? { count: options.count } : {});
    } catch (e) {
      handleError(e);
    } finally {
      setGenerating(false);
    }
  }

  const isRateLimited = rateLimitedUntil !== null && rateLimitedUntil > Date.now();

  return { generating, error, generate: manualGenerate, isRateLimited };
}
