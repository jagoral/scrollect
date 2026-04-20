import { usePostHog } from "posthog-js/react";
import { useEffect, useRef } from "react";

export function usePostImpression(postId: string, properties: Record<string, unknown>) {
  const posthog = usePostHog();
  const hasTracked = useRef(false);
  const ref = useRef<HTMLElement>(null);
  const propertiesRef = useRef(properties);
  propertiesRef.current = properties;

  useEffect(() => {
    hasTracked.current = false;
    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasTracked.current) {
          hasTracked.current = true;
          const props = { ...propertiesRef.current };
          if (typeof props.created_at === "number") {
            props.post_age_hours = Math.round((Date.now() - props.created_at) / 3600000);
            delete props.created_at;
          }
          posthog.capture("post.viewed", props);
          observer.disconnect();
        }
      },
      { threshold: 0.5 },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [posthog, postId]);

  return ref;
}
