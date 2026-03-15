---
status: proposed
date: 2026-03-12
---

# ADR-005: E2E testing strategy for URL ingestion

## Context

URL content ingestion (ADR-004) introduces two external API dependencies into the processing pipeline: markdown.new for article extraction and YouTube's internal APIs for transcript extraction. These dependencies create three problems for E2E testing:

1. **Speed.** Real extraction adds 1–10 seconds per test. With 15+ URL ingestion tests, that's 2+ minutes of network-bound time on top of the existing test suite.
2. **Reliability.** External APIs have rate limits (markdown.new: 500 req/day/IP), transient failures, and can change behavior without notice. Flaky tests erode trust in CI.
3. **Cost.** While extraction itself is free, each test run also triggers embedding (OpenAI API) and potentially card generation (GPT-4o-mini). At 20+ PR pushes/day, costs accumulate.

The existing test infrastructure (`apps/e2e/`) uses Playwright for browser-driven E2E tests against a real Convex deployment. Tests create users, upload documents, and verify the full flow through the UI. The pipeline already uses factory functions for providers (`createEmbeddingProvider`, `createVectorStore` in `pipeline/helpers.ts`) — we extend this pattern to content extractors.

## Decision

### 1. Two-tier test strategy

Split E2E tests into two tiers that run at different frequencies:

|                         | Tier 1: PR CI                              | Tier 2: Integration                              |
| ----------------------- | ------------------------------------------ | ------------------------------------------------ |
| **Trigger**             | Every push to a PR branch                  | Merge to main, nightly, or manual                |
| **Extraction**          | Stub extractors (canned markdown)          | Real extractors (markdown.new, YouTube)          |
| **Downstream pipeline** | Real chunking + real embedding             | Real chunking + real embedding                   |
| **Card generation**     | Not tested                                 | Not tested (separate concern)                    |
| **Speed**               | ~30s per test (stub extraction is instant) | ~30–90s per test (network-bound)                 |
| **Reliability**         | No external API dependency                 | Depends on markdown.new and YouTube availability |
| **Cost per run**        | ~$0.001 (embedding only)                   | ~$0.003 (embedding only, larger content)         |
| **File convention**     | `*.spec.ts`                                | `*.slow.spec.ts`                                 |

Both tiers run real chunking and real embedding — only the HTTP call to the external extraction APIs is stubbed in Tier 1. This means chunking code paths, embedding, and document status transitions are all exercised.

**Why two tiers instead of all-stub or all-real:**

- **All-stub** misses real extraction bugs. If YouTube changes its page structure and breaks Level 1 of the fallback chain, we wouldn't know until a user reports it. Tier 2 catches this on every merge to main.
- **All-real** is too slow and flaky for PR CI. Developers need fast feedback on UI changes, validation logic, and pipeline routing — none of which require real extraction.

Neither tier tests `feed.generation.generate` (the GPT-4o-mini call that produces learning cards). Card generation is an existing feature with its own test coverage concerns, and GPT output is non-deterministic (fuzzy assertions are inherently flaky). The ingestion pipeline's contract is "document reaches `ready` status with chunks" — everything downstream is independent.

### 2. Stub extractors behind factory functions with env var

Two stub classes (`StubArticleExtractor`, `StubYouTubeExtractor` in `providers/stubs.ts`) implement the `ContentExtractor` interface from ADR-004.

**Stub content design principles:**

- **Substantive enough to exercise the full pipeline.** Each stub produces markdown with multiple sections that chunk into 3+ chunks. Chunking, embedding, and document status transitions are all exercised.
- **Deterministic.** Same URL always produces the same output. No randomness, no timestamps. Tests can assert on chunk counts and document titles.
- **Structurally representative.** The article stub has `#`/`##` headings and paragraphs. The YouTube stub has `## [M:SS]` timestamp headers matching the real extractor's output format. This exercises the same chunking code paths as real content.

Factory functions in `pipeline/helpers.ts` select the implementation at runtime:

- `createArticleExtractor()` — returns `StubArticleExtractor` when `USE_STUB_EXTRACTORS=true`, otherwise `MarkdownNewExtractor`
- `createYouTubeExtractor()` — returns `StubYouTubeExtractor` when `USE_STUB_EXTRACTORS=true`, otherwise `YouTubeTranscriptExtractor`

**Why env var, not a runtime flag or database setting:**

- **Follows the existing pattern.** `createEmbeddingProvider()` and `createVectorStore()` already use `process.env` to select implementations.
- **Deployment-level, not request-level.** Stub mode applies to an entire Convex deployment, not individual requests. The E2E test deployment has `USE_STUB_EXTRACTORS=true`, production does not.
- **No test code in the hot path.** The factory function is a single `if` check. No test-specific middleware, no request header inspection.

### 3. Convex preview deployments for CI isolation

#### Problem: shared deployment is unsafe

The current CI workflow toggles `USE_STUB_EXTRACTORS` on a shared Convex deployment. This creates three problems:

1. **Race condition.** Two concurrent PR CI runs toggle the same env var. Run A enables stubs, Run B disables stubs for Tier 2, Run A's tests now hit real APIs unexpectedly.
2. **Dev pollution.** If a developer is using `npx convex dev` against the same deployment while CI runs, their local testing is affected.
3. **Accidental production exposure.** If `CONVEX_DEPLOY_KEY` points to the production deployment (misconfiguration), CI would toggle stubs on production.

#### Solution: Convex preview deployments

Each CI run creates its own isolated Convex preview deployment via `npx convex deploy --preview-create "e2e-${{ github.run_id }}"`. Preview deployments are fully isolated: own database, own env vars, own URL. They don't share data with development or production.

**Deployment topology:**

| Deployment              | Purpose            | `USE_STUB_EXTRACTORS` | Deploy key                  |
| ----------------------- | ------------------ | --------------------- | --------------------------- |
| `dev:formal-camel-858`  | Local development  | unset                 | N/A (`.env.local`)          |
| Preview: `e2e-<run_id>` | E2E tests (Tier 1) | `"true"`              | `CONVEX_PREVIEW_DEPLOY_KEY` |
| Preview: `e2e-<run_id>` | E2E tests (Tier 2) | unset                 | `CONVEX_PREVIEW_DEPLOY_KEY` |
| Production              | User-facing        | unset                 | `CONVEX_DEPLOY_KEY`         |

**Key properties:**

- **No race conditions.** Each CI run uses its own preview (named by `github.run_id`). Concurrent PR runs get separate previews with separate databases and env vars.
- **Dev deployment is never touched by CI.** Preview Deploy Keys are scoped to preview deployments only.
- **Clean database per run.** No leftover test data from previous runs. Use `--preview-run` to seed initial data if needed.
- **Auto-cleanup.** Previews are ephemeral — auto-deleted after 5 days (14 days on Pro plan), or when a new preview with the same name is created.

**One-time setup:** Create a Preview Deploy Key in the Convex dashboard (Settings > Deploy Keys), add `CONVEX_PREVIEW_DEPLOY_KEY` as a GitHub Actions secret.

### Alternatives considered

- **Separate Convex project as staging** — Persistent env vars and full dashboard, but overkill for ephemeral E2E tests. Separate billing, manual env var sync when schema changes.
- **Toggle env vars on shared deployment** (current) — Simplest setup, but race conditions between concurrent CI runs, dev pollution, and production risk.
- **All-stub testing** — Fast and reliable, but misses real extraction regressions. YouTube page structure changes wouldn't surface until a user reports it.

## Consequences

- **PR CI stays fast and reliable**: Stub extraction is instant and deterministic. The only external dependency in Tier 1 is the OpenAI embedding API (~200ms, highly available). CI cost under $0.50/month
- **Real extraction bugs are caught before production**: Tier 2 runs on every merge to main, verifying markdown.new and YouTube extraction still work. A broken fallback chain surfaces within hours, not days
- **Dev and production are fully isolated from CI**: Each CI run uses its own Convex preview deployment with a clean database and isolated env vars. No race conditions, no dev interference
- **Adding new content types is mechanical**: Add a stub class to `providers/stubs.ts`, add a factory function to `pipeline/helpers.ts`, write `*.spec.ts` (Tier 1) and `*.slow.spec.ts` (Tier 2) tests. No changes to Playwright config or CI workflows — the `*.slow.spec.ts` convention handles exclusion automatically
- **Card generation testing deferred, not forgotten**: Neither tier tests GPT-4o-mini card generation (separate concern, non-deterministic). The same factory pattern extends to generation when needed (`StubCardGenerator` + `USE_STUB_GENERATION`)
- **Minimal setup cost**: One-time Preview Deploy Key creation. Per-run: ~5s to set env vars on the preview deployment
