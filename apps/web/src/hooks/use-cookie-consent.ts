import type { PostHog } from "posthog-js";
import { useEffect } from "react";

import { createCookieConsentConfig } from "@/lib/cookie-consent-config";

let initPromise: Promise<void> | null = null;

export function useCookieConsent(posthog: PostHog) {
  useEffect(() => {
    let mounted = true;
    let observer: MutationObserver | undefined;

    initPromise = (async () => {
      const cc = await import("vanilla-cookieconsent");
      if (!mounted) return;

      await cc.run(createCookieConsentConfig({ posthog, cc }));

      syncDarkMode(document.documentElement);
      observer = observeDarkModeChanges(document.documentElement);
    })();

    initPromise.catch((err) => {
      console.error("Cookie consent initialization failed:", err);
    });

    return () => {
      mounted = false;
      observer?.disconnect();
    };
  }, [posthog]);
}

export function showCookiePreferences() {
  if (!initPromise) return;
  initPromise.then(() => {
    import("vanilla-cookieconsent").then((cc) => cc.showPreferences());
  });
}

function syncDarkMode(html: HTMLElement) {
  if (html.classList.contains("dark")) {
    html.classList.add("cc--darkmode");
  } else {
    html.classList.remove("cc--darkmode");
  }
}

function observeDarkModeChanges(html: HTMLElement): MutationObserver {
  const observer = new MutationObserver(() => syncDarkMode(html));
  observer.observe(html, { attributes: true, attributeFilter: ["class"] });
  return observer;
}
