# Mobile Store Readiness Checklist

Operational checklist for submitting Scrollect mobile to **TestFlight** (iOS)
and **Google Play Internal Testing** (Android). All in-repo deliverables for
M6 (#247) are done; the items below require Apple Developer / Google Play
Console access and must be completed manually before the first submission.

> Scope: Internal beta only. No public store launch in MVP (epic #241).

## What is already in the repo

| Deliverable                         | Status   | Where                                                                             |
| ----------------------------------- | -------- | --------------------------------------------------------------------------------- |
| App icons (iOS + Android adaptive)  | Done     | `apps/native/assets/icon.png`, `adaptive-icon.png`                                |
| Splash screen                       | Done     | `apps/native/assets/splash-icon.png` (configured via `expo-splash-screen` plugin) |
| Web favicon                         | Done     | `apps/native/assets/favicon.png`                                                  |
| Bundle id                           | Done     | `com.scrollect.app` (iOS + Android)                                               |
| Encryption declaration              | Done     | `ITSAppUsesNonExemptEncryption: false` in `app.json`                              |
| Notification permission             | Done     | `POST_NOTIFICATIONS` declared in `app.json`                                       |
| Account deletion entry point        | Done     | Settings -> "Delete account on web" links to `${SITE_URL}/app/settings`           |
| Subscription management entry point | Done     | Settings -> "Manage subscription on web"                                          |
| No billing UI in app                | Verified | Grep for checkout / polar / stripe / iap / paywall returns no matches             |
| No social login                     | Verified | Email/password only - **Sign in with Apple not required**                         |
| Maestro E2E suite                   | Done     | `.maestro/flows/` - sign-in, feed reactions, bookmark + saved                     |
| Maestro CI                          | Done     | `.github/workflows/maestro.yml` (PRs to dev, gated on `ENABLE_MAESTRO` repo var)  |

## What still needs to happen (manual)

### 1. App Store Connect (iOS)

#### Build

1. Bump `version` in `apps/native/app.json` to `1.0.0` for the first
   submission (currently `0.0.1`).
2. Run `eas build --platform ios --profile production`. EAS handles
   provisioning and signing.
3. Run `eas submit --platform ios --latest`. The build uploads to App Store
   Connect.
4. Wait for Apple processing (10-30 min). Add the build to a TestFlight
   group ("Internal Testing" -> add testers).

#### Store listing

| Field                | Suggested value                                                                                                                                    |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Name                 | Scrollect                                                                                                                                          |
| Subtitle             | Your saved knowledge, scrollable                                                                                                                   |
| Category (primary)   | Education                                                                                                                                          |
| Category (secondary) | Productivity                                                                                                                                       |
| Age rating           | 4+                                                                                                                                                 |
| Description (long)   | See `description.md` snippet below                                                                                                                 |
| Promotional text     | Turn the books, articles, and videos you've saved into a feed of bite-sized learning cards. AI summarises, quizzes, and connects what you've read. |
| Keywords             | learning, knowledge, reading, summary, AI, books, notes, feed                                                                                      |
| Support URL          | `https://scrollect.app/support` (TODO before submit if not live)                                                                                   |
| Marketing URL        | `https://scrollect.app`                                                                                                                            |
| Privacy policy URL   | `https://scrollect.app/privacy` (must be live)                                                                                                     |

#### Screenshots (iOS)

Required: 6.7" iPhone screenshots, **3 minimum**. Capture from a 6.7" simulator
(iPhone 15 Pro Max or 16 Pro Max):

1. Feed with insight + quote post visible.
2. Saved tab with at least 3 bookmarks.
3. Topics list with 4-6 topics.

Save to `docs/screenshots/mobile/ios-67/`. Apple no longer requires multiple
device sizes if you ship the 6.7" set.

#### Privacy nutrition labels

App Store Connect -> App Privacy. Declare:

- **Contact Info -> Email Address**: Linked to user (Account; Auth: email/password).
- **Identifiers -> User ID**: Linked to user (App Functionality; Convex user id).
- **Usage Data -> Product Interaction**: Linked to user (Analytics; PostHog reactions, scroll, bookmarks).
- **Diagnostics -> Crash Data**: Linked to user (App Functionality; PostHog exceptions).
- **Diagnostics -> Performance Data**: Linked to user (Analytics; PostHog).

Data is not used for tracking (no third-party advertising).

#### Compliance gates (verify before each submission)

- [ ] No in-app purchase / Polar checkout UI on iOS (web-only billing).
- [ ] "Delete account on web" reachable from Settings (links to web flow).
- [ ] No third-party social login (so Sign in with Apple not required).
- [ ] Encryption declaration: `ITSAppUsesNonExemptEncryption: false` (no
      custom crypto; Apple counts HTTPS as exempt).

### 2. Google Play Console (Android)

#### Build

1. Run `eas build --platform android --profile production`.
2. Run `eas submit --platform android --latest`. The AAB uploads to Play
   Console.
3. Promote to **Internal testing** track (sidebar -> Testing -> Internal
   testing). Add testers' Google emails to the testers list.

#### Store listing

| Field                       | Suggested value                                            |
| --------------------------- | ---------------------------------------------------------- |
| App name                    | Scrollect                                                  |
| Short description (80 char) | Turn what you've saved into a scrollable AI learning feed. |
| Full description            | See `description.md` snippet below                         |
| Category                    | Education                                                  |
| Tags                        | Learning, Knowledge, AI                                    |
| Contact email               | `support@scrollect.app` (or your team's address)           |
| Privacy policy              | `https://scrollect.app/privacy` (must be live)             |

#### Screenshots (Android)

Phone screenshots, **2-8 required**, 16:9 or 9:16, 320-3840 px. Capture from
a Pixel 7 emulator or a real device:

1. Feed with multiple post types.
2. Saved tab.
3. Topics + topic feed.

Save to `docs/screenshots/mobile/android-phone/`. Also provide:

- Feature graphic: 1024 x 500 PNG/JPG (one image; no transparency).
- App icon: pulled from the AAB automatically (already uploaded via build).

#### Data Safety form

Play Console -> App content -> Data safety. Declare:

- **Personal info -> Email address**: Collected, linked to user, processed
  ephemerally (Auth). Required. Encrypted in transit. User can request
  deletion via "Delete account" in Settings.
- **App activity -> App interactions**: Collected, linked to user (Analytics).
  Optional - not strictly required by user.
- **App info and performance -> Crash logs**: Collected, linked to user
  (Diagnostics).
- **Device or other IDs -> Device or other IDs**: Collected if PostHog uses
  anonymous device id. Linked to user (Analytics).

Data sharing: **No** (we don't share with third parties beyond service
providers - PostHog and Convex - which are not "sharing" under Play's
definition).

#### Account deletion

Play Console -> Policy -> App content -> Data safety -> "Provide a way for
users to request account deletion". The web flow at
`${SITE_URL}/app/settings` is acceptable per Google policy (confirmed in
the M6 issue scope review). Link the same URL in the Play listing's
"Account deletion URL" field.

#### Compliance gates

- [ ] Target API level meets current Play Console requirement (Expo SDK 55
      ships with API 35 - safe through 2026).
- [ ] Permissions declared match runtime requests
      (`POST_NOTIFICATIONS` only).
- [ ] No billing UI in-app (Play permits external billing for content
      consumed across platforms; we redirect to web).

### 3. Common copy

#### Long description snippet

```
Scrollect turns the books, articles, videos, and notes you've already saved
into a scrollable feed of bite-sized learning cards.

- Insights summarise key ideas in a paragraph.
- Quotes surface the exact lines worth remembering.
- Quizzes check whether you actually internalised it.
- Connections link ideas across documents you didn't realise were related.

You add content on the web at scrollect.app - upload a PDF, paste a URL, or
drop in a YouTube link. The app generates a feed you can scroll between
meetings, on the train, or in line for coffee. Like, dislike, and bookmark
to teach the feed what you find useful.

Scrollect is personal. There are no followers, no comments, no public
profiles. The feed is built from your library, for you.

Subscriptions, billing, and account management happen on the web at
scrollect.app.
```

## Pre-submit smoke test

Before each submission run, on a real device:

1. Sign in with email/password.
2. Scroll through 5+ posts in the feed.
3. Bookmark a post; switch to Saved; verify it's there.
4. Switch to Topics; tap one topic; verify the topic feed renders.
5. Switch to Settings; tap "Manage subscription on web" - confirm browser
   opens.
6. Tap "Delete account on web" - confirm browser opens (do not actually
   delete the test account).
7. Background the app for 30s; bring it back; verify it doesn't crash and
   the feed still works.

If any step fails, do not submit. The Maestro suite covers steps 1-3 in CI;
the rest are manual.
