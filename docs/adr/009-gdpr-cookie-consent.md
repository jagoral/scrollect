# ADR-009: GDPR cookie consent via CookieConsent + PostHog opt-in/opt-out API

**Status:** accepted
**Date:** 2026-03-19
**Issue:** [#90](https://github.com/jagoral/scrollect/issues/90)

## Context

Scrollect uses PostHog for product analytics and pipeline observability (#88). PostHog is deeply integrated across the app - 15+ client-side `posthog.capture` calls plus server-side pipeline analytics via `posthog-node`. Under GDPR, all client-side tracking requires explicit, informed, freely-given consent before it fires.

## Decisions

### 1. Client-only, lazy-loaded CookieConsent

Dynamic `import("vanilla-cookieconsent")` inside a `useEffect` in a `useCookieConsent` hook. No SSR bundle impact, no hydration mismatches. The library manages its own `cc_cookie` for persisting preferences client-side.

### 2. Two categories: necessary + analytics

No advertising or third-party integrations exist. Over-categorizing adds UI complexity with zero privacy benefit.

| Category  | Purpose                                                      | Consent required |
| --------- | ------------------------------------------------------------ | :--------------: |
| Necessary | Better-Auth session cookies, CSRF tokens                     |        No        |
| Analytics | PostHog product analytics, card impressions, feed engagement |       Yes        |

### 3. PostHog starts opted-out

`opt_out_capturing_by_default: true` + `persistence: "memory"`. The `PostHogProvider` still renders so all 15+ existing `usePostHog()` call sites work unchanged - calls are silently dropped until `posthog.opt_in_capturing()` is called via CookieConsent's `onConsent` callback.

### 4. Config in dedicated file

`apps/web/src/lib/cookie-consent-config.ts` exports a factory accepting PostHog and CookieConsent module references, returning the full CookieConsent config (categories, translations, PostHog bridge callbacks).

### 5. Backend analytics NOT gated

Server-side pipeline events use Convex user ID only, no cookies/fingerprinting. If legal requires it later, add a `consentedToAnalytics` boolean to the users table.

### 6. CSS via Tailwind v4 tokens

CookieConsent's CSS custom property API maps to existing design tokens. Dark mode synced by observing the `html` element's `dark` class and toggling `cc--darkmode`.

## Key trade-off

PostHog JS loads even before consent (it just doesn't capture anything). This avoids null guards across 15+ components. If bundle size of the opted-out client becomes a concern, the alternative is a conditional provider that only renders PostHogProvider after consent - this requires `usePostHog()` to handle null.

## New/modified files

- `apps/web/src/hooks/use-cookie-consent.ts` (new)
- `apps/web/src/lib/cookie-consent-config.ts` (new)
- `apps/web/src/routes/__root.tsx` (modified - PostHog options + hook)
- `apps/web/src/components/footer.tsx` (modified - Cookie Settings button)
- `apps/web/src/index.css` (modified - CookieConsent CSS overrides)
