import { useEffect, useRef, useState } from "react";

const STALE_THRESHOLD_MS = 3_600_000; // 1 hour

/**
 * Auto-triggers feed generation once on mount if the feed is stale
 * (no posts or oldest post > 1 hour old).
 */
export function useAutoGenerate(
  lastGeneratedAt: number | null | undefined,
  generateFeed: () => Promise<unknown>,
) {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const triggered = useRef(false);

  useEffect(() => {
    if (triggered.current) return;
    if (lastGeneratedAt === undefined) return; // still loading

    const isStale = lastGeneratedAt === null || Date.now() - lastGeneratedAt > STALE_THRESHOLD_MS;

    if (isStale) {
      triggered.current = true;
      setGenerating(true);
      setError(null);
      generateFeed()
        .catch((e) => {
          setError(e instanceof Error ? e.message : "Failed to generate feed");
        })
        .finally(() => setGenerating(false));
    }
  }, [lastGeneratedAt, generateFeed]);

  async function manualGenerate() {
    setGenerating(true);
    setError(null);
    try {
      await generateFeed();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate feed");
    } finally {
      setGenerating(false);
    }
  }

  return { generating, error, generate: manualGenerate };
}
