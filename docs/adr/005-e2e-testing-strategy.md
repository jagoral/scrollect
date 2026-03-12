# ADR-005: E2E Testing Strategy for URL Ingestion

**Status:** Proposed
**Date:** 2026-03-12
**Author:** Scrollect Team

## Context

URL content ingestion (ADR-004) introduces two external API dependencies into the processing pipeline: markdown.new for article extraction and YouTube's internal APIs for transcript extraction. These dependencies create three problems for E2E testing:

1. **Speed.** Real extraction adds 1–10 seconds per test. With 15+ URL ingestion tests, that's 2+ minutes of network-bound time on top of the existing test suite.
2. **Reliability.** External APIs have rate limits (markdown.new: 500 req/day/IP), transient failures, and can change behavior without notice. Flaky tests erode trust in CI.
3. **Cost.** While extraction itself is free, each test run also triggers embedding (OpenAI API) and potentially card generation (GPT-4o-mini). At 20+ PR pushes/day, costs accumulate.

The existing test infrastructure (`apps/e2e/`) uses Playwright for browser-driven E2E tests against a real Convex deployment. Tests create users, upload documents, and verify the full flow through the UI. The pipeline already uses factory functions for providers (`createEmbeddingProvider`, `createVectorStore` in `pipeline/helpers.ts`) — we extend this pattern to content extractors.

## Decisions

### 1. Two-tier test strategy

Split E2E tests into two tiers that run at different frequencies:

|                         | Tier 1: PR CI                              | Tier 2: Integration                              |
| ----------------------- | ------------------------------------------ | ------------------------------------------------ |
| **Trigger**             | Every push to a PR branch                  | Merge to main, nightly, or manual                |
| **Extraction**          | Stub extractors (canned markdown)          | Real extractors (markdown.new, YouTube)          |
| **Downstream pipeline** | Real chunking + real embedding             | Real chunking + real embedding                   |
| **Card generation**     | Not tested                                 | Not tested (separate concern, see Section 5)     |
| **Speed**               | ~30s per test (stub extraction is instant) | ~30–90s per test (network-bound extraction)      |
| **Reliability**         | No external API dependency                 | Depends on markdown.new and YouTube availability |
| **Cost per run**        | ~$0.001 (embedding only)                   | ~$0.003 (embedding only, larger content)         |
| **File convention**     | `*.spec.ts`                                | `*.slow.spec.ts`                                 |

**Why two tiers instead of all-stub or all-real:**

- **All-stub** misses real extraction bugs. If YouTube changes its page structure and breaks Level 1 of the fallback chain, we wouldn't know until a user reports it. Tier 2 catches this on every merge to main.
- **All-real** is too slow and flaky for PR CI. Developers need fast feedback on UI changes, validation logic, and pipeline routing — none of which require real extraction.

### 2. `StubContentExtractor` implementations in `providers/stubs.ts`

Two stub classes implement the `ContentExtractor` interface (from ADR-004):

```ts
// providers/stubs.ts
export class StubArticleExtractor implements ContentExtractor {
  async extract(url: string): Promise<ExtractResult> {
    return {
      markdown: STUB_ARTICLE_MARKDOWN, // ~50 lines, 4 sections, produces 3+ chunks
      title: `Stub Article from ${new URL(url).hostname}`,
    };
  }
}

export class StubYouTubeExtractor implements ContentExtractor {
  async extract(url: string): Promise<ExtractResult> {
    return {
      markdown: STUB_YOUTUBE_MARKDOWN, // ~50 lines, 7 timestamp sections, produces 3+ chunks
      title: `Stub YouTube Video (${videoId})`,
      metadata: { provider: "stub" },
    };
  }
}
```

**Stub content design principles:**

- **Substantive enough to exercise the full pipeline.** Each stub produces markdown with multiple sections that chunk into 3+ chunks. This means chunking, embedding, and document status transitions are all exercised — only the HTTP call to the external API is stubbed.
- **Deterministic.** Same URL always produces the same output. No randomness, no timestamps. Tests can assert on chunk counts and document titles.
- **Structurally representative.** The article stub has `#`/`##` headings and paragraphs. The YouTube stub has `## [M:SS]` timestamp headers matching the real extractor's output format. This exercises the same chunking code paths as real content.

### 3. Factory functions with `USE_STUB_EXTRACTORS` env var

Factory functions in `pipeline/helpers.ts` select the implementation at runtime:

```ts
export function createArticleExtractor(): ContentExtractor {
  if (process.env.USE_STUB_EXTRACTORS === "true") return new StubArticleExtractor();
  return new MarkdownNewArticleExtractor();
}

export function createYouTubeExtractor(): ContentExtractor {
  if (process.env.USE_STUB_EXTRACTORS === "true") return new StubYouTubeExtractor();
  const apifyApiToken = process.env.APIFY_API_TOKEN ?? undefined;
  return new YouTubeTranscriptExtractor({ apifyApiToken });
}
```

The extraction pipeline (`pipeline/extraction.ts`) calls these factories instead of constructing extractors directly.

**Why env var, not a runtime flag or database setting:**

- **Follows the existing pattern.** `createEmbeddingProvider()` and `createVectorStore()` already use `process.env` to select implementations. Adding `createArticleExtractor()` and `createYouTubeExtractor()` is consistent.
- **Deployment-level, not request-level.** Stub mode applies to an entire Convex deployment, not individual requests. This matches the test infrastructure model: the E2E test deployment has `USE_STUB_EXTRACTORS=true`, production does not.
- **No test code in the hot path.** The factory function is a single `if` check. No test-specific middleware, no request header inspection, no feature flag queries.

**Configuration per tier** (see Section 4 for deployment strategy):

| Env var               | Preview deployment (Tier 1) | Preview deployment (Tier 2) | Dev deployment | Production |
| --------------------- | --------------------------- | --------------------------- | -------------- | ---------- |
| `USE_STUB_EXTRACTORS` | `"true"`                    | `"false"` or unset          | unset          | unset      |

Each CI run creates its own isolated Convex preview deployment. Env vars are set per run — no persistent state to manage.

### 4. Convex deployment isolation via preview deployments

#### Problem: shared deployment is unsafe

The current CI workflow (`ci.yml`) toggles `USE_STUB_EXTRACTORS` on a shared Convex deployment:

```yaml
# PROBLEMATIC — mutates shared state
- run: npx convex env set USE_STUB_EXTRACTORS true # Tier 1
- run: npx convex env unset USE_STUB_EXTRACTORS # Tier 2
- run: npx convex env set USE_STUB_EXTRACTORS true # cleanup
```

This creates three problems:

1. **Race condition.** Two concurrent PR CI runs toggle the same env var. Run A enables stubs, Run B disables stubs for Tier 2, Run A's tests now hit real APIs unexpectedly.
2. **Dev pollution.** If a developer is using `npx convex dev` against the same deployment while CI runs, their local testing is affected by CI's env var changes.
3. **Accidental production exposure.** If `CONVEX_DEPLOY_KEY` points to the production deployment (misconfiguration), CI would toggle stubs on production.

#### Decision: Convex preview deployments for E2E

Convex has built-in [preview deployments](https://docs.convex.dev/production/hosting/preview-deployments) — ephemeral, isolated backends within the same project. Each preview gets its own database, env vars, and URL. They do not share data with development or production deployments.

**How it works:**

When `CONVEX_DEPLOY_KEY` is set to a **Preview Deploy Key** (a separate key type from the production deploy key), `npx convex deploy` creates a fresh preview backend instead of deploying to production:

```bash
npx convex deploy --preview-create "e2e-${{ github.run_id }}"
```

The `--preview-create <name>` flag names the preview. If a preview with that name already exists, the old one is deleted and a new one is provisioned. In Vercel/Netlify/GitHub CI environments, the name defaults to the current git branch.

**Key behaviors (from [Convex docs](https://docs.convex.dev/production#staging-environment)):**

- Preview deployments are **fully isolated**: own database, own env vars, own URL. "Convex preview deployments do not share data with development or production Convex deployments."
- **Ephemeral**: auto-cleaned after 5 days (14 days on Pro plan), or when a new preview with the same name is created.
- **Only one deployment per name**: creating a preview with the same name replaces the previous one.
- `--preview-run <functionName>` executes a setup function after deployment (only on previews — ignored for production deploys). Useful for seeding test data.
- Env vars are set per preview via `npx convex env set` with the Preview Deploy Key.
- The `--cmd` flag can chain a frontend build that receives the preview URL: `npx convex deploy --cmd 'npm run build' --cmd-url-env-var-name NEXT_PUBLIC_CONVEX_URL`.

**Deployment topology:**

| Deployment              | Purpose                              | `USE_STUB_EXTRACTORS` | Deploy key                  |
| ----------------------- | ------------------------------------ | --------------------- | --------------------------- |
| `dev:formal-camel-858`  | Local development (`npx convex dev`) | unset                 | N/A (uses `.env.local`)     |
| Preview: `e2e-<run_id>` | E2E tests (Tier 1)                   | `"true"`              | `CONVEX_PREVIEW_DEPLOY_KEY` |
| Preview: `e2e-<run_id>` | E2E tests (Tier 2)                   | unset                 | `CONVEX_PREVIEW_DEPLOY_KEY` |
| Production              | User-facing                          | unset                 | `CONVEX_DEPLOY_KEY`         |

**CI workflow — Tier 1 (PR CI):**

```yaml
- name: Deploy to preview
  id: convex-preview
  run: |
    cd packages/backend
    DEPLOY_OUTPUT=$(npx convex deploy --preview-create "e2e-${{ github.run_id }}" 2>&1)
    # Extract the preview deployment URL from deploy output
    PREVIEW_URL=$(echo "$DEPLOY_OUTPUT" | grep -oP 'https://[^ ]+\.convex\.cloud')
    echo "url=$PREVIEW_URL" >> "$GITHUB_OUTPUT"
  env:
    CONVEX_DEPLOY_KEY: ${{ secrets.CONVEX_PREVIEW_DEPLOY_KEY }}

- name: Set preview env vars
  run: |
    cd packages/backend
    npx convex env set USE_STUB_EXTRACTORS true
    npx convex env set OPENAI_API_KEY "$OPENAI_API_KEY"
    npx convex env set QDRANT_URL "$QDRANT_URL"
    npx convex env set QDRANT_API_KEY "$QDRANT_API_KEY"
    npx convex env set BETTER_AUTH_SECRET "$BETTER_AUTH_SECRET"
    npx convex env set SITE_URL http://localhost:3001
  env:
    CONVEX_DEPLOY_KEY: ${{ secrets.CONVEX_PREVIEW_DEPLOY_KEY }}
    OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
    QDRANT_URL: ${{ vars.QDRANT_URL }}
    QDRANT_API_KEY: ${{ secrets.QDRANT_API_KEY }}
    BETTER_AUTH_SECRET: ${{ secrets.BETTER_AUTH_SECRET }}

- name: Run E2E tests (fast)
  run: bun run test:e2e
  env:
    NEXT_PUBLIC_CONVEX_URL: ${{ steps.convex-preview.outputs.url }}
```

**CI workflow — Tier 2 (merge-to-main):**

```yaml
- name: Disable stubs for integration tests
  run: cd packages/backend && npx convex env set USE_STUB_EXTRACTORS false
  env:
    CONVEX_DEPLOY_KEY: ${{ secrets.CONVEX_PREVIEW_DEPLOY_KEY }}

- name: Run E2E tests (slow)
  run: cd apps/e2e && npx playwright test --project=slow
  env:
    NEXT_PUBLIC_CONVEX_URL: ${{ steps.convex-preview.outputs.url }}
```

No cleanup step is needed to re-enable stubs — the preview deployment is ephemeral. Convex auto-cleans previews after 5 days (14 days on Pro), or when a new preview with the same name is created.

**Key properties:**

- **Dev deployment is never touched by CI.** The Preview Deploy Key cannot target dev or production deployments.
- **Production deployment is never touched by CI.** Preview Deploy Keys are scoped to preview deployments only.
- **No race conditions.** Each CI run uses its own preview deployment (named by `github.run_id`). Concurrent PR runs get separate previews with separate databases and env vars.
- **Clean database per run.** Preview deployments start fresh — no leftover test data from previous runs. Use `--preview-run` to seed initial data if needed.
- **Schema stays in sync.** `npx convex deploy` pushes the current branch's schema and functions to the preview.
- **Auto-cleanup.** Previews are ephemeral and auto-deleted. No manual cleanup of stale test deployments.

**Setup (one-time):**

1. In the Convex dashboard, go to Settings > Deploy Keys > "Create Preview Deploy Key".
2. Add `CONVEX_PREVIEW_DEPLOY_KEY` as a GitHub Actions secret.
3. Remove the old `CONVEX_DEPLOY_KEY` usage from E2E test steps (keep it only for production deploys).

#### Alternatives considered

| Approach                                                                                                                                        | Pros                                                                                   | Cons                                                                    |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| **Preview deployments** (chosen)                                                                                                                | Built-in, isolated per run, no race conditions, clean database each time, auto-cleanup | Must set env vars per run (adds ~5s to CI)                              |
| **Separate Convex project as staging** ([recommended by Convex](https://docs.convex.dev/production#staging-environment) for persistent staging) | Persistent env vars (set once), full dashboard, persistent data                        | Overkill for ephemeral E2E tests; separate billing; manual env var sync |
| **Toggle env vars on shared deployment** (current)                                                                                              | Simplest, no setup                                                                     | Race conditions, dev pollution, production risk                         |

### 5. Test file organization

```
apps/e2e/tests/
  url-ingestion.spec.ts       # Tier 1: stub extractors, runs on every PR
  url-ingestion.slow.spec.ts  # Tier 2: real extractors, runs on merge-to-main / nightly
  upload-and-library.spec.ts  # Existing file upload tests (unchanged)
  feed-interactions.spec.ts   # Feed/bookmark tests (unchanged)
  ...
```

**Playwright config** excludes `*.slow.spec.ts` from the default `chromium` project:

```ts
// playwright.config.ts
projects: [
  {
    name: "chromium",
    testIgnore: [/global-setup\.ts/, /\.slow\.spec\.ts/],
    // ...
  },
],
```

To run Tier 2 tests manually: `npx playwright test url-ingestion.slow.spec.ts`.

**Convention:** Any test file that depends on real external APIs (not just Convex or OpenAI) uses the `.slow.spec.ts` suffix. This is a project-wide convention, not specific to URL ingestion.

### 6. Card generation is excluded from both tiers

Neither tier tests `feed.generation.generate` (the GPT-4o-mini call that produces learning cards from chunks). Rationale:

- **Card generation is an existing feature** that predates URL ingestion. It has its own test coverage concerns, separate from the ingestion pipeline.
- **The ingestion pipeline's contract is "document reaches `ready` status with chunks."** Everything downstream of that (card generation, feed rendering) is independent and already tested by `feed-interactions.spec.ts` using seeded data.
- **GPT calls are the most expensive operation** (~$0.0002 per call at gpt-4o-mini pricing, but multiplied across many tests and PR pushes).
- **GPT output is non-deterministic.** Testing that cards "look right" requires fuzzy assertions that are inherently flaky.

If card generation testing becomes necessary (e.g., after the multi-type generation work from ADR-003), it should follow the same pattern: a `StubCardGenerator` behind a factory function with `USE_STUB_GENERATION=true`, tested in Tier 1 for pipeline plumbing, and in Tier 2 with real GPT calls for output quality.

### 7. How to add a new integration test

When adding a new content type (e.g., podcast, Spotify):

1. **Add a stub class** to `providers/stubs.ts` implementing `ContentExtractor`. Return representative markdown that exercises the chunking path.
2. **Add a factory function** to `pipeline/helpers.ts` with the `USE_STUB_EXTRACTORS` check.
3. **Write Tier 1 tests** in the appropriate `*.spec.ts` file. Test: URL detection, form submission, success toast, document appears in library, processing reaches "ready" status.
4. **Write Tier 2 tests** in a `*.slow.spec.ts` file. Test: real extraction with a stable, known URL. Assert document reaches "ready" with non-zero chunk count.
5. **Update `pipeline/extraction.ts`** to use the factory function instead of direct `new` calls.

No changes to `playwright.config.ts` or CI workflows are needed — the `*.slow.spec.ts` convention handles exclusion automatically. The E2E deployment (Section 4) is already configured with the correct env vars.

## Cost Estimates

Assumptions: 20 PR pushes/day, 1 merge-to-main/day, 15 Tier 1 tests, 2 Tier 2 tests. Each test produces ~5 chunks embedded via OpenAI `text-embedding-3-small`.

| Component              | Tier 1 (per PR push)                            | Tier 2 (per merge)                        | Monthly estimate |
| ---------------------- | ----------------------------------------------- | ----------------------------------------- | ---------------- |
| OpenAI embedding       | 15 tests x 5 chunks x $0.00001/chunk = $0.00075 | 2 tests x ~10 chunks x $0.00001 = $0.0002 | ~$0.46           |
| markdown.new API       | $0 (stubbed)                                    | 1 call (free)                             | $0               |
| YouTube API            | $0 (stubbed)                                    | 1 call (free)                             | $0               |
| GPT-4o-mini generation | $0 (not tested)                                 | $0 (not tested)                           | $0               |
| Convex compute         | Included in plan                                | Included in plan                          | $0               |
| **Total**              | **~$0.001/push**                                | **~$0.001/merge**                         | **~$0.50**       |

The cost is dominated by embedding, which is negligible. The key savings come from not calling GPT for card generation in CI and not calling real extraction APIs on every PR push.

## Consequences

- **PR CI stays fast and reliable.** Stub extraction is instant and deterministic. The only external dependency in Tier 1 is the OpenAI embedding API, which is fast (~200ms) and highly available.
- **Real extraction bugs are caught before production.** Tier 2 runs on every merge to main, verifying that markdown.new and YouTube extraction still work. A broken YouTube fallback chain surfaces within hours, not days.
- **Dev and production are isolated from CI.** Each CI run uses its own Convex preview deployment with a clean database and isolated env vars. CI never touches dev or production. Developers can run `npx convex dev` without interference. No race conditions between concurrent CI runs.
- **Adding new content types is mechanical.** The stub + factory + tier convention means a new extractor follows a 5-step recipe (Section 7) with no architecture decisions.
- **Test infrastructure in production code is minimal.** Two factory functions (4 lines each) and one env var check. The stub classes live in `providers/stubs.ts` — they're never imported in production code, only via the factory functions when the env var is set.
- **Card generation testing is deferred, not forgotten.** The same factory pattern extends to generation when needed. The architecture supports it without changes.
- **Minimal setup cost.** One-time: create a Preview Deploy Key in the Convex dashboard and add it to GitHub secrets. Per-run: ~5s to set env vars on the preview deployment.
