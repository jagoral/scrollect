---
status: accepted
date: 2026-03-20
---

# ADR-010: Production deployment pipeline - Convex + Vercel (two-branch model)

## Context

Scrollect needs a complete deployment pipeline that coordinates two independently deployed systems: Convex (backend functions + schema) and Vercel (SSR web app). The deploy order matters - the web app imports generated types from `@scrollect/backend` and calls Convex functions by name, so deploying new frontend code against a stale backend causes runtime errors. Schema changes are particularly sensitive: a new field read by client code will throw if the Convex deployment still has the old schema.

Today there is no production deployment workflow. The CI pipeline (`.github/workflows/ci.yml`) only handles preview deployments for E2E tests. The cleanup workflow deletes stale preview deployments nightly. We need to define how code reaches production and development environments, how schema changes are applied safely, and how preview deployments work for PR review.

**Branch model:** `PR -> dev -> main`. Feature PRs target `dev` (development Convex + Vercel preview/dev). When ready for production, merge `dev` into `main` (production Convex + Vercel production). CI E2E tests use ephemeral Convex previews on both branches.

## Decision

### 1. Deploy order: Convex first, then Vercel (both branches)

Every deployment - to `dev` or `main` - follows this sequence:

1. `npx convex deploy` in `packages/backend/` (pushes functions + schema to the target Convex deployment)
2. `npx convex run migrations:runAll` (runs any pending data migrations to completion)
3. Vercel build + deploy of `apps/web/` (the web app, built against the now-current Convex deployment)

The deploy workflow triggers on both `main` (production) and `dev` (development) branches. The branch determines which Convex deployment and deploy key to use.

This order is mandatory because:

- Convex schema changes are applied atomically with function deployment. New functions that reference new fields only become callable after `convex deploy` succeeds.
- Migrations must run after deploy (the new migration functions must exist on the server) but before the web app goes live (the web app may depend on backfilled data).
- The web app's build bakes in `VITE_CONVEX_URL` (the target Convex URL) and imports type-generated code from `@scrollect/backend`. If Convex deploys after Vercel, there is a window where the web app calls functions or reads fields that do not yet exist.

If the Convex deploy or migration run fails, the Vercel deploy must not proceed. The pipeline aborts.

### 2. Single GitHub Actions workflow, branch-conditional environment

A single `.github/workflows/deploy.yml` deploys Convex on both `main` and `dev`. It triggers via `workflow_run` after the CI workflow completes successfully, ensuring tests pass before any deployment. The branch determines which deploy key (and therefore which Convex deployment) to use:

```
on:
  workflow_run:
    workflows: [CI]
    types: [completed]
    branches: [main, dev]

jobs:
  deploy-convex:
    if: github.event.workflow_run.conclusion == 'success'
    steps:
      - # Set CONVEX_DEPLOY_KEY based on branch:
        # main -> CONVEX_PROD_DEPLOY_KEY secret
        # dev  -> CONVEX_DEV_DEPLOY_KEY secret
      - npx convex deploy
      - npx convex run migrations:runAll

  # Vercel's GitHub integration auto-triggers on the same push.
```

Vercel handles its own web app builds via its native GitHub integration. Do not use `vercel deploy` from CI.

Why split responsibility this way:

- Vercel's GitHub integration provides zero-config deploys, instant rollbacks, preview URLs, and build caching. Replicating this with `vercel deploy --prod` from CI means managing Vercel tokens, losing the dashboard integration, and reimplementing rollback UX.
- Convex deploy must happen in CI because Vercel's build step cannot run `npx convex deploy` before `vite build` - Vercel runs a single build command, not an orchestrated pipeline.
- The ordering concern (Convex before Vercel) is acceptable as a "soft dependency": Convex deploy takes 5-15 seconds and finishes well before Vercel's build (60-120 seconds). On the rare occasion Convex deploy fails but Vercel build succeeds, the old web app code is still compatible with the old Convex deployment (both were in sync before this push). The new Vercel deploy would reference functions/fields that don't exist yet - but since the code change and the schema change are in the same commit, the Vercel build itself will also fail (missing generated types from `convex deploy`).

For additional safety, add a post-deploy health check step that verifies the Convex deployment is reachable before Vercel's build completes. This can be a simple HTTP ping to the Convex health endpoint.

### 3. Schema migrations via `@convex-dev/migrations`

Convex applies schema changes atomically during `npx convex deploy`, but data backfills are the developer's responsibility. Adopt the `@convex-dev/migrations` component from day one so that every backfill is stateful, resumable, and automated in CI - not a manual dashboard action that someone forgets.

**Setup.** Register the component in `convex/convex.config.ts` (alongside the existing `betterAuth` and `rateLimiter` components). Define all migrations in `convex/migrations.ts` with a `runAll` runner that CI invokes after every deploy.

**Two-phase schema change pattern.** This is Convex's fundamental constraint and applies regardless of tooling:

1. **Deploy 1**: Add the field as `v.optional()` in `schema.ts`. Write a migration in `convex/migrations.ts` that backfills the field. Deploy, then run `migrations:runAll`. The migration processes documents in batches with cursor-based resumption.
2. **Deploy 2**: Change the field from `v.optional()` to required. Deploy. The migration already ran, so all documents have the field.

For other schema operations:

- **Adding a new optional field** (no backfill needed): Change `schema.ts`, deploy. All read sites handle `undefined` via TypeScript.
- **Removing a field**: Remove from schema, deploy. Data at rest is retained but inaccessible through the typed API.
- **Renaming a table or field**: Convex does not support renames. Add the new name, write a migration to copy values, deploy. Second deploy removes the old name.

**Migration best practices:**

- **Dry run before production.** Use `migrations.runner()` with `dryRun: true` on the dev deployment to validate one batch without committing. This catches bad migration logic before it touches production data.
- **Serial dependencies.** When migrations must run in order (e.g., backfill field A, then compute field B from A), pass them as an ordered array to `migrations.runner()`. The runner executes them sequentially and stops if any migration fails.
- **Cursor-based resume.** If a migration fails mid-way (e.g., timeout, transient error), re-running `migrations:runAll` resumes from the last successful cursor position. No data is processed twice.
- **Duplicate prevention.** The component refuses to start a migration that is already running. Safe to call `runAll` on every deploy even when there are no pending migrations - it is a no-op.
- **Monitoring.** Use `migrations.getStatus()` to check migration progress from the Convex dashboard or via a health check function. Each migration tracks its state (pending, running, complete, failed) and cursor position.
- **Keep migrations in `convex/migrations.ts`.** One file, all migrations, ordered. Do not scatter them across feature modules. Old completed migrations can stay in the file as documentation - the runner skips them.

### 4. Environment variable management

Two systems, two sets of env vars, mapped across branches:

**GitHub Actions secrets** (used by the deploy workflow):

| Secret                   | Branch | Purpose                       |
| ------------------------ | ------ | ----------------------------- |
| `CONVEX_PROD_DEPLOY_KEY` | `main` | Production Convex deploy key  |
| `CONVEX_DEV_DEPLOY_KEY`  | `dev`  | Development Convex deploy key |

**Convex env vars** (server-side, set via `npx convex env set` or dashboard):

| Variable             | Dev (dev branch)        | Production (main branch)                  |
| -------------------- | ----------------------- | ----------------------------------------- |
| `OPENAI_API_KEY`     | Dashboard               | Dashboard                                 |
| `QDRANT_URL`         | Dashboard               | Dashboard                                 |
| `QDRANT_API_KEY`     | Dashboard               | Dashboard                                 |
| `BETTER_AUTH_SECRET` | Dashboard               | Dashboard                                 |
| `SITE_URL`           | `http://localhost:3000` | `https://scrollect.app` (or final domain) |
| `POSTHOG_API_KEY`    | Dashboard               | Dashboard                                 |
| `DATALAB_API_KEY`    | Dashboard               | Dashboard                                 |

Convex env vars are set once per deployment (dev or production) and persist across deploys. They do not need to be in CI secrets unless they change per deploy. The existing CI workflow already sets them for preview deployments.

**Vercel env vars** (build-time, set in Vercel project settings):

| Variable                   | Preview (dev PRs)                     | Production (main)                      |
| -------------------------- | ------------------------------------- | -------------------------------------- |
| `NITRO_PRESET`             | `vercel`                              | `vercel`                               |
| `VITE_CONVEX_URL`          | `https://dev-deployment.convex.cloud` | `https://prod-deployment.convex.cloud` |
| `VITE_CONVEX_SITE_URL`     | `https://dev-deployment.convex.site`  | `https://prod-deployment.convex.site`  |
| `VITE_SITE_URL`            | (auto, Vercel preview URL)            | `https://scrollect.app`                |
| `VITE_PUBLIC_POSTHOG_KEY`  | Same as prod (or unset)               | PostHog project key                    |
| `VITE_PUBLIC_POSTHOG_HOST` | Same as prod (or unset)               | `https://eu.i.posthog.com`             |

All `VITE_*` variables are inlined at build time by Vite. They are not runtime secrets - they are safe to include in Vercel's project settings.

### 5. Branch flow and preview deployments

**PR flow:** `PR -> dev -> main`

- Feature PRs target `dev`. Merging to `dev` triggers CI, then deploys Convex functions to the development deployment.
- When a set of changes is ready for production, merge `dev` into `main`. This triggers CI, then deploys Convex functions to the production deployment.
- CI runs on both branches. E2E tests use ephemeral Convex preview deployments (ADR-005), not the dev or production deployments.

**Vercel previews** (auto-created per PR) point to the **dev** Convex deployment, not production. Set `VITE_CONVEX_URL` in Vercel's "Preview" environment scope to the dev Convex URL.

Do not create per-PR Convex preview deployments for Vercel previews. The E2E CI pipeline already creates isolated Convex previews for test runs (ADR-005). Vercel previews serve a different purpose: visual review of UI changes by a human. The dev Convex deployment has enough test data for this, and creating a Convex preview per Vercel preview would require a build hook to run `convex deploy --preview-create` during Vercel's build - adding complexity for minimal benefit.

If the dev deployment's data becomes a problem (e.g., schema divergence between PR branch and dev), the developer can run `npx convex dev` locally to push their branch's schema to the dev deployment before the Vercel preview builds. This is acceptable for a single-developer project.

### 6. Rollback strategy

**Convex rollback**: Convex does not support instant rollback to a previous deployment. If a bad Convex deploy reaches production:

- Fix forward: push a corrective commit. `npx convex deploy` with the fix takes 5-15 seconds.
- For schema-only issues: if a new required field breaks existing data, the fix is to make it optional (and deploy again).
- Convex preserves data across deploys - a schema revert does not lose data.

**Vercel rollback**: Vercel supports instant rollback to any previous deployment via the dashboard or `vercel rollback`. However, rolling back Vercel without rolling back Convex creates the same version mismatch problem. Only roll back Vercel if the Convex deployment is still compatible with the older web app code.

**Combined rollback sequence** (worst case - bad push broke both systems):

1. Revert the commit on `main` (creates a new commit, not a force push)
2. CI deploys the reverted Convex functions (5-15 seconds)
3. Vercel deploys the reverted web app (60-120 seconds)
4. Alternatively, use Vercel instant rollback to the previous deployment while waiting for the Convex revert deploy

**Mitigation**: The existing CI pipeline (lint, unit tests, E2E tests against a Convex preview) runs before merge to `main`. Production deploy only happens after CI passes. The risk of a bad deploy is low.

### Alternatives considered

- **Convex deploy inside Vercel's build step** - Run `npx convex deploy` as a pre-build script in Vercel. This guarantees ordering (Convex deploys before the web app builds) but couples Convex deployment to Vercel's build infrastructure. If the Vercel build is cancelled or retried, Convex may deploy twice or get into an inconsistent state. It also requires storing `CONVEX_DEPLOY_KEY` in Vercel's env vars, expanding the secret's exposure surface. Rejected in favor of keeping Convex deploy in GitHub Actions where it is already proven (preview deploys work today).

- **Separate Convex production project for staging** - A second Convex project that mirrors production for pre-deploy validation. Adds billing, manual env var sync, and the staging database drifts from production anyway. Overkill for a personal app. The E2E preview deployments already provide pre-merge validation.

- **Per-PR Convex preview for Vercel previews** - Create a Convex preview deployment during each Vercel preview build so the preview app has its own backend. Requires a Vercel build hook or GitHub Action that creates the preview, extracts the URL, and passes it to Vercel as a build-time env var. The timing is fragile (Vercel build must wait for Convex preview creation) and cleanup is another concern. The dev deployment is sufficient for visual PR review.

- **Manual backfills via Convex dashboard** - Write one-off internal mutations in a `convex/maintenance.ts` file and run them manually from the dashboard after each deploy. Simpler for a single developer, but relies on human memory to run the right mutation at the right time. Forgotten backfills cause silent bugs when deploy 2 (making a field required) fails against un-backfilled data. The `@convex-dev/migrations` component automates this via `runAll` in CI, eliminating the human step.

- **Monorepo-aware deploy with Turborepo Remote Cache** - Use Turborepo's `turbo deploy` pipeline to orchestrate Convex + Vercel deploys with caching. Turborepo does not have a deploy task concept; `turbo run` is for build/test tasks. The deploy orchestration belongs in CI, not the build tool.

## Consequences

- **Production deploys are automated on merge to main**: Push to `main` triggers Convex deploy, migration run, and Vercel deploy in the correct order. No manual steps for routine deploys, including data backfills.
- **Schema changes require two-phase thinking**: Any required field addition needs two deploys (add as optional + migration, then make required). This is Convex's fundamental constraint. The `@convex-dev/migrations` component automates the backfill step, but the developer must still plan the two-deploy sequence.
- **Migrations are a new component dependency**: `@convex-dev/migrations` is registered in `convex.config.ts` and creates internal tables to track migration state. This is lightweight (one component, no external services) but adds a dependency that all developers must understand. Migrations that mutate data incorrectly are not automatically reversible - write a compensating migration to undo mistakes.
- **Vercel previews see dev data, not production data**: PR reviewers see the dev Convex deployment's data. This is a feature (no risk of exposing production data in previews) and a limitation (preview may not reflect production data shape). Acceptable for a personal app.
- **No zero-downtime deploy guarantee**: There is a brief window (seconds) between Convex deploy completing and Vercel deploy completing where the web app serves old code against the new backend. Convex's backward-compatible deploy model (old functions are replaced atomically) means this window is safe for additive changes. Destructive changes (removing a field that old code reads) require a two-phase approach regardless.
- **Rollback is fix-forward, not instant**: Convex has no deployment rollback. The fastest recovery is a revert commit, which takes 2-3 minutes end-to-end. For a personal app with 10-100 users, this is acceptable. A high-traffic app would need a feature flag layer to gate risky changes.
- **Secret management is split across two systems**: Convex env vars in the Convex dashboard, Vercel env vars in the Vercel dashboard. This is inherent to using two hosted services. A secrets manager (e.g., Doppler, Infisical) could unify them but adds another dependency. Not justified at current scale.

## More Information

- ADR-005 covers CI preview deployments for E2E testing.
- `@convex-dev/migrations` component: https://github.com/get-convex/migrations
- Convex deployment docs: https://docs.convex.dev/production/hosting
- Convex environment variables: https://docs.convex.dev/production/environment-variables
- Vercel monorepo configuration: https://vercel.com/docs/monorepos
- The `NITRO_PRESET` environment variable approach: https://nitro.build/deploy#changing-the-deployment-preset
