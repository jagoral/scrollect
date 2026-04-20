import { usePostHog } from "posthog-js/react";
import { useEffect, useRef } from "react";

interface UsePostImpressionOptions {
  dwellTimeMs?: number;
  onViewed?: () => void;
  threshold?: number;
}

export function usePostImpression(
  postId: string,
  properties: Record<string, unknown>,
  options: UsePostImpressionOptions = {},
) {
  const posthog = usePostHog();
  const hasTracked = useRef(false);
  const ref = useRef<HTMLElement>(null);
  const propertiesRef = useRef(properties);
  const onViewedRef = useRef(options.onViewed);
  const dwellTimeMs = options.dwellTimeMs ?? 500;
  const threshold = options.threshold ?? 0.5;
  propertiesRef.current = properties;
  onViewedRef.current = options.onViewed;

  useEffect(() => {
    hasTracked.current = false;
    const element = ref.current;
    if (!element) return;
    let dwellTimer: ReturnType<typeof setTimeout> | undefined;

    const clearDwellTimer = () => {
      if (!dwellTimer) return;
      clearTimeout(dwellTimer);
      dwellTimer = undefined;
    };

    const trackViewed = () => {
      if (hasTracked.current) return;
      hasTracked.current = true;
      const props = { ...propertiesRef.current };
      if (typeof props.created_at === "number") {
        props.post_age_hours = Math.round((Date.now() - props.created_at) / 3600000);
        delete props.created_at;
      }
      posthog.capture("post.viewed", props);
      onViewedRef.current?.();
      observer.disconnect();
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (hasTracked.current) return;
        if (entry.isIntersecting) {
          clearDwellTimer();
          dwellTimer = setTimeout(trackViewed, dwellTimeMs);
        } else {
          clearDwellTimer();
        }
      },
      { threshold },
    );

    observer.observe(element);
    return () => {
      clearDwellTimer();
      observer.disconnect();
    };
  }, [dwellTimeMs, posthog, postId, threshold]);

  return ref;
}
