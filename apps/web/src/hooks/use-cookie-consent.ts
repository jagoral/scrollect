import type { PostHog } from "posthog-js";
import type CookieConsent from "vanilla-cookieconsent";
import { useEffect } from "react";

import { createCookieConsentConfig } from "@/lib/cookie-consent-config";

let didInit = false;
let ccModule: typeof CookieConsent | null = null;
let initPromise: Promise<void> | null = null;

export function useCookieConsent(posthog: PostHog) {
  useEffect(() => {
    if (didInit) return;
    didInit = true;

    let observer: MutationObserver | undefined;

    initPromise = (async () => {
      const cc = await import("vanilla-cookieconsent");
      ccModule = cc;

      await cc.run(createCookieConsentConfig({ posthog, cc }));

      syncDarkMode(document.documentElement);
      observer = observeDarkModeChanges(document.documentElement);
    })();

    initPromise.catch((err) => {
      didInit = false;
      console.error("Cookie consent initialization failed:", err);
    });

    return () => {
      observer?.disconnect();
    };
  }, [posthog]);
}

export function showCookiePreferences() {
  if (!initPromise || !ccModule) return;
  initPromise
    .then(() => ccModule!.showPreferences())
    .catch((err) => console.error("Failed to show cookie preferences:", err));
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
