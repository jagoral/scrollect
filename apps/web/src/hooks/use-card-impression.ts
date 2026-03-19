import { usePostHog } from "posthog-js/react";
import { useEffect, useRef } from "react";

export function useCardImpression(cardId: string, properties: Record<string, unknown>) {
  const posthog = usePostHog();
  const hasTracked = useRef(false);
  const ref = useRef<HTMLElement>(null);
  const propertiesRef = useRef(properties);

  useEffect(() => {
    propertiesRef.current = properties;
  });

  useEffect(() => {
    const element = ref.current;
    if (!element || hasTracked.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasTracked.current) {
          hasTracked.current = true;
          const props = { ...propertiesRef.current };
          if (typeof props.created_at === "number") {
            props.card_age_hours = Math.round((Date.now() - props.created_at) / 3600000);
            delete props.created_at;
          }
          posthog.capture("card.viewed", props);
          observer.disconnect();
        }
      },
      { threshold: 0.5 },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [posthog, cardId]);

  return ref;
}
