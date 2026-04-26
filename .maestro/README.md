# Maestro E2E suite

Critical-path mobile flows for the Scrollect Expo app. Three flows, each ~10s
on a warm emulator:

1. `01-sign-in.yaml` - email/password sign-in reaches the feed.
2. `02-feed-react.yaml` - feed renders, like one post, dislike one with a reason.
3. `03-bookmark-saved.yaml` - bookmark a post, switch to Saved, verify it appears.

Flows 2 and 3 chain `01-sign-in.yaml` via `runFlow:` so each can be invoked
independently.

## Prerequisites

- A running app build with bundle id `com.scrollect.app` (the dev client or
  any EAS preview build works).
- A backend the app talks to that has the seeded test account and seeded
  feed data:
  - account: `e2e-seeded-account@test.scrollect.dev` / `testpassword123`
  - seed: hit `${VITE_CONVEX_SITE_URL}/api/e2e-seed?email=<account>` (the same
    HTTP action the Playwright suite uses - see `apps/e2e/tests/helpers.ts`).
  - the backend must have `ENABLE_E2E_ROUTES=true` set.

## Running locally

```bash
# Install Maestro (one-time):
curl -fsSL "https://get.maestro.mobile.dev" | bash

# Boot a simulator/emulator and run the dev client (or install the EAS preview build).
# Then from the repo root:
maestro test .maestro/flows
```

To run a single flow:

```bash
maestro test .maestro/flows/01-sign-in.yaml
```

## Running in CI

CI runs flows on Maestro Cloud via `.github/workflows/maestro.yml` whenever a
PR to `dev` touches `apps/native/**`, `.maestro/**`, or one of the backend
modules the flows depend on (`schema.ts`, `http.ts`, `access/`, `feed/`,
`content/bookmarks.ts`, `ops/testing*.ts`).

The workflow is gated on the `ENABLE_MAESTRO` repo variable - set it to
`true` once the required configuration is in place. Required:

- `secrets.MAESTRO_CLOUD_API_KEY` - Maestro Cloud API key
- `secrets.EXPO_TOKEN` - EAS build token
- `vars.MAESTRO_CONVEX_URL` - Convex deployment URL the APK is baked against
- `vars.MAESTRO_SITE_URL` - Convex site URL for seed + auth HTTP routes

Optional (PostHog telemetry inside the test build):

- `secrets.MAESTRO_POSTHOG_KEY`, `vars.MAESTRO_POSTHOG_HOST`

The job verifies all required values exist before running the build, so a
misconfiguration fails in seconds instead of after a 5-10 minute APK build.

The CI workflow builds an Android APK with `eas build --profile preview
--platform android --local`, uploads it to Maestro Cloud, and runs the flows
there. iOS is not in CI yet because EAS local iOS builds require macOS
runners (10x cost multiplier) - run them locally before merging anything
auth- or feed-shaped.

### Shared backend caveat

The APK bakes in `EXPO_PUBLIC_CONVEX_URL` at build time, so every PR run
talks to the same Convex deployment (`vars.MAESTRO_CONVEX_URL`). Concurrent
PR runs therefore share state - the seed action wipes feed/bookmark state
on each run, but two PRs in flight at the same minute can race. For MVP
cadence this is acceptable; if mobile PR rate grows past one-at-a-time,
either move to a per-PR Convex preview parity with `ci.yml` (rebuild the
APK with the preview's Convex URL) or change the workflow's
`concurrency.group` to a workflow-wide singleton so runs serialize.

## Adding a new flow

1. Add the YAML under `.maestro/flows/`. Keep flows under ~30 steps so they
   stay under the 60s Maestro Cloud timeout.
2. Reuse `runFlow: 01-sign-in.yaml` rather than duplicating the sign-in
   sequence.
3. Prefer `id: "test-id"` over text matchers - test ids survive copy and
   theme changes; visible text doesn't.
4. Tag with `core` for the must-pass set or `smoke` for slower flows we may
   later gate to nightly.
