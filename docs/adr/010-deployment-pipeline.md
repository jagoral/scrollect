---
status: accepted
date: 2026-03-20
---

# ADR-010: Production deployment pipeline - Convex + Vercel (two-branch model)

## Context

Scrollect needs a deployment pipeline that coordinates two independently deployed systems: Convex (backend functions + schema) and Vercel (SSR web app). Deploy order matters - the web app calls Convex functions by name at runtime, so deploying new frontend code against a stale backend causes runtime errors.

Today there is no production deployment workflow. The CI pipeline (`.github/workflows/ci.yml`) handles preview deployments for E2E tests only. We need to define how code reaches production and development environments, how schema changes are applied safely, and how the two systems stay in sync.

**Branch model:** `PR -> dev -> main`. Feature PRs target `dev` (development). When ready for production, merge `dev` into `main`. CI runs on PRs before merge via branch protection rules.

## Decision

### 1. Convex deploys inside Vercel's build step (official integration)

Use Convex's official Vercel integration. Override Vercel's build command to:

```
npx convex deploy --cmd 'npx convex run migrations:runAll && npm run build'
```

This command:

1. Reads the `CONVEX_DEPLOY_KEY` environment variable
2. Pushes Convex functions + schema to the target deployment
3. Runs the provided `--cmd`: first executes pending migrations, then builds the web app

This guarantees ordering - Convex functions are live before the web app builds against them. No separate GitHub Actions deploy workflow needed.

**Why this approach:**

- Ordering is guaranteed by design. Convex deploys before the build starts, eliminating any race condition between backend and frontend.
- Single system. No GitHub Actions secrets, no `deploy.yml` workflow, no coordination between two CI systems.
- This is Convex's documented and recommended approach for Vercel deployments.

### 2. Two-branch model with Vercel environment scoping

Vercel environment scoping maps naturally to the branch model:

| Vercel scope | Branch              | Convex deployment |
| ------------ | ------------------- | ----------------- |
| Production   | `main`              | Production        |
| Preview      | `dev` + PR branches | Development       |

Set `CONVEX_DEPLOY_KEY` twice in Vercel's environment variables:

- **Production** scope: production Convex deploy key (generated from production deployment dashboard)
- **Preview** scope: development Convex deploy key (generated from dev deployment dashboard)

When Vercel builds a production deploy (merge to `main`), it uses the production key. When it builds a preview deploy (PR or push to `dev`), it uses the dev key. Convex functions deploy to the correct environment automatically.

### 3. Schema migrations via `@convex-dev/migrations`

Adopt the `@convex-dev/migrations` component for automated, stateful data backfills. Register in `convex/convex.config.ts`, define all migrations in `convex/migrations.ts`.

Migrations run as part of the Vercel build command (see section 1) - after `convex deploy` succeeds and before the web app builds. This ensures backfilled data is available when the new frontend goes live.

**Two-phase schema change pattern** (Convex's fundamental constraint):

1. **Deploy 1**: Add the field as `v.optional()` in `schema.ts`. Write a migration that backfills it. Deploy. The migration runs automatically.
2. **Deploy 2**: Change the field from `v.optional()` to required. Deploy. All documents already have the field.

**Two-phase function change pattern** (for removals/renames):

1. **Deploy 1**: Add the new function, keep the old one. Deploy. Frontend starts using the new function.
2. **Deploy 2**: Remove the old function. Deploy. No callers remain.

This avoids a window where the old frontend calls a function that no longer exists.

**Migration best practices:**

- Migrations are cursor-based and resumable. Re-running `migrations:runAll` after a failure resumes from the last successful position.
- The runner is idempotent and skips completed migrations. Safe to call on every deploy.
- Keep all migrations in `convex/migrations.ts`. One file, ordered. Old completed migrations stay as documentation.

### 4. Environment variable management

**Vercel env vars** (set in Vercel project settings):

| Variable                   | Preview (dev/PR)           | Production (main)          |
| -------------------------- | -------------------------- | -------------------------- |
| `CONVEX_DEPLOY_KEY`        | Dev deploy key             | Prod deploy key            |
| `VITE_CONVEX_URL`          | Dev `.convex.cloud` URL    | Prod `.convex.cloud` URL   |
| `VITE_CONVEX_SITE_URL`     | Dev `.convex.site` URL     | Prod `.convex.site` URL    |
| `VITE_SITE_URL`            | (auto, Vercel preview URL) | `https://scrollect.app`    |
| `VITE_PUBLIC_POSTHOG_KEY`  | Same as prod (or unset)    | PostHog project key        |
| `VITE_PUBLIC_POSTHOG_HOST` | Same as prod (or unset)    | `https://eu.i.posthog.com` |
| `NITRO_PRESET`             | `vercel`                   | `vercel`                   |

**Convex env vars** (server-side, set via dashboard per deployment):

| Variable             | Dev deployment          | Production deployment   |
| -------------------- | ----------------------- | ----------------------- |
| `OPENAI_API_KEY`     | Dashboard               | Dashboard               |
| `QDRANT_URL`         | Dashboard               | Dashboard               |
| `QDRANT_API_KEY`     | Dashboard               | Dashboard               |
| `BETTER_AUTH_SECRET` | Dashboard               | Dashboard               |
| `SITE_URL`           | `http://localhost:3000` | `https://scrollect.app` |
| `POSTHOG_API_KEY`    | Dashboard               | Dashboard               |
| `DATALAB_API_KEY`    | Dashboard               | Dashboard               |

Convex env vars persist across deploys. Set once per deployment.

### 5. Branch flow and preview deployments

**PR flow:** `PR -> dev -> main`

- Feature PRs target `dev`. CI runs on the PR (branch protection requires it to pass). Merging to `dev` triggers Vercel preview build, which deploys Convex functions to the dev deployment.
- When ready for production, merge `dev` into `main`. Vercel production build triggers, deploying Convex functions to the production deployment.

**Vercel previews** (auto-created per PR) use the dev Convex deployment via the Preview-scoped `CONVEX_DEPLOY_KEY`. No per-PR Convex preview deployments needed for Vercel previews - the E2E CI pipeline handles isolated previews separately (ADR-005).

### 6. Rollback strategy

**Convex rollback**: No instant rollback. Fix forward by pushing a corrective commit. `npx convex deploy` takes 5-15 seconds.

**Vercel rollback**: Instant rollback via dashboard. But rolling back Vercel without rolling back Convex creates version mismatch. Only roll back Vercel if the Convex deployment is still compatible.

**Combined rollback** (worst case):

1. Revert the commit on `main` (new commit, not force push)
2. Vercel rebuilds: Convex redeploys reverted functions, then web app builds (60-120s total)
3. Or use Vercel instant rollback while waiting for the rebuild

**Mitigation**: CI runs on PRs before merge. Branch protection requires passing checks. The risk of bad code reaching `main` is low.

### Alternatives considered

- **Separate GitHub Actions workflow for Convex deploy** - A `deploy.yml` triggered on push or via `workflow_run` after CI. This decouples Convex deploy from Vercel but introduces a race condition: if triggered on push, both systems deploy concurrently with no ordering guarantee; if triggered after CI (~10 min), the new frontend is live ~9 minutes before the new backend. The Vercel build integration solves this by design.

- **Separate Convex production project for staging** - Adds billing, manual env var sync, and drift. Overkill for a personal app. E2E preview deployments already provide pre-merge validation.

- **Per-PR Convex preview for Vercel previews** - Requires a build hook to create the preview, extract the URL, and pass it as a build-time env var. Fragile timing and cleanup concerns. The dev deployment is sufficient for visual PR review.

- **Manual backfills via Convex dashboard** - Relies on human memory. Forgotten backfills cause silent bugs when deploy 2 (making a field required) fails against un-backfilled data. `@convex-dev/migrations` automates this.

## Consequences

- **Deploys are fully automated**: Merge triggers Vercel build, which deploys Convex functions, runs migrations, and builds the web app in guaranteed order. No manual steps.
- **Schema and function changes require two-phase thinking**: Any breaking change needs two deploys. The `@convex-dev/migrations` component automates data backfills, but the developer must plan the sequence.
- **Migrations are a new component dependency**: `@convex-dev/migrations` creates internal tables for state tracking. Lightweight, but all developers must understand the pattern.
- **Vercel previews see dev data, not production data**: A feature (no production data exposure) and a limitation (preview may not reflect production data shape). Acceptable for a personal app.
- **Deploy key lives in Vercel, not GitHub**: Secrets are scoped to the deployment platform that uses them. Fewer systems to manage.
- **Rollback is fix-forward, not instant**: Convex has no deployment rollback. Fastest recovery is a revert commit (~60-120s for full redeploy). Acceptable for 10-100 users.

## More Information

- ADR-005 covers CI preview deployments for E2E testing.
- Convex + Vercel deployment docs: https://docs.convex.dev/production/hosting/vercel
- `@convex-dev/migrations` component: https://github.com/get-convex/migrations
- Convex environment variables: https://docs.convex.dev/production/environment-variables
