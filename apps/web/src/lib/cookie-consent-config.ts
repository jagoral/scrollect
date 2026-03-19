import type { PostHog } from "posthog-js";
import type CookieConsent from "vanilla-cookieconsent";

type CookieConsentConfig = Parameters<(typeof CookieConsent)["run"]>[0];

interface ConfigDeps {
  posthog: PostHog;
  cc: typeof CookieConsent;
}

export function createCookieConsentConfig({ posthog, cc }: ConfigDeps): CookieConsentConfig {
  return {
    mode: "opt-in",
    revision: 0,

    guiOptions: {
      consentModal: {
        layout: "bar inline",
        position: "bottom",
        equalWeightButtons: true,
        flipButtons: false,
      },
      preferencesModal: {
        layout: "box",
        equalWeightButtons: true,
        flipButtons: false,
      },
    },

    categories: {
      necessary: {
        enabled: true,
        readOnly: true,
      },
      analytics: {
        enabled: false,
        autoClear: {
          cookies: [{ name: /^ph_/ }, { name: /^__ph/ }],
        },
      },
    },

    onConsent: () => {
      if (cc.acceptedCategory("analytics")) {
        posthog.opt_in_capturing();
        posthog.capture("consent.given", { analytics_accepted: true });
      }
    },

    onChange: ({ changedCategories }) => {
      if (!changedCategories.includes("analytics")) return;

      const accepted = cc.acceptedCategory("analytics");

      if (accepted) {
        posthog.opt_in_capturing();
        posthog.capture("consent.changed", { analytics_accepted: true });
      } else {
        posthog.capture("consent.changed", { analytics_accepted: false });
        posthog.opt_out_capturing();
        posthog.reset();
      }
    },

    language: {
      default: "en",
      translations: {
        en: {
          consentModal: {
            title: "We value your privacy",
            description:
              'We use analytics cookies to understand how you use Scrollect and improve your experience. Essential cookies for authentication always remain active. Read our <a href="/privacy-policy" target="_blank" rel="noopener noreferrer" class="cc__link">Privacy Policy</a> for details.',
            acceptAllBtn: "Accept analytics",
            acceptNecessaryBtn: "Reject",
            showPreferencesBtn: "Preferences",
          },
          preferencesModal: {
            title: "Cookie preferences",
            acceptAllBtn: "Accept all",
            acceptNecessaryBtn: "Reject all",
            savePreferencesBtn: "Save preferences",
            closeIconLabel: "Close",
            sections: [
              {
                title: "How we use cookies",
                description:
                  "Scrollect uses cookies to keep you signed in and, with your permission, to understand how you interact with the app so we can make it better.",
              },
              {
                title: "Essential cookies",
                description:
                  "These cookies are required for authentication and basic functionality. They cannot be disabled.",
                linkedCategory: "necessary",
              },
              {
                title: "Analytics cookies",
                description:
                  "Analytics cookies help us understand usage patterns - which features you use, how you navigate the feed, and where you encounter issues. This data is processed by PostHog (EU-hosted) and is never sold to third parties.",
                linkedCategory: "analytics",
                cookieTable: {
                  headers: {
                    name: "Name",
                    description: "Description",
                    duration: "Duration",
                  },
                  body: [
                    {
                      name: "ph_*",
                      description:
                        "PostHog analytics - tracks product usage and feature engagement",
                      duration: "1 year",
                    },
                  ],
                },
              },
            ],
          },
        },
      },
    },
  };
}
