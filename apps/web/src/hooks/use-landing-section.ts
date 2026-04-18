import { usePostHog } from "posthog-js/react";
import { useEffect, useRef, useState } from "react";

type SectionName = "hero" | "how_it_works" | "card_types" | "pricing" | "bottom_cta";

export function useLandingSection(sectionName: SectionName, { initiallyVisible = false } = {}) {
  const posthog = usePostHog();
  const posthogRef = useRef(posthog);
  posthogRef.current = posthog;

  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(initiallyVisible);
  const tracked = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;

        setIsVisible(true);

        if (!tracked.current) {
          tracked.current = true;
          posthogRef.current?.capture("landing_scroll_depth", { section: sectionName });
        }

        observer.disconnect();
      },
      { threshold: 0.15 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [sectionName]);

  return { ref, isVisible };
}
