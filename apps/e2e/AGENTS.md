# E2E Test Best Practices

## Architecture

- **Setup project** (`global-setup.ts`) runs once before all tests — creates/seeds a shared E2E account
- **Seeded account** (`e2e-seeded-account@test.scrollect.dev`) has pre-populated data (documents, chunks, posts) for tests that don't need fresh state
- **Ephemeral accounts** (via `testUser()`) are used when tests need clean state (e.g., upload tests)
- Shared helpers live in `tests/helpers.ts` — never duplicate auth/data helpers across spec files

## Test projects & tag routing

Tests are split into two Playwright projects using the `@seeded` tag:

| Project     | Tag       | Account   | Cost | Use for                         | Workers    |
| ----------- | --------- | --------- | ---- | ------------------------------- | ---------- |
| `seeded`    | `@seeded` | Seeded    | $0   | UI interactions, card rendering | 1 (serial) |
| `ephemeral` | (none)    | Ephemeral | Low  | Upload flow, library mutations  | default    |

**Routing rule**: `test.describe` blocks with `{ tag: "@seeded" }` run in the `seeded` project. Everything else runs in `ephemeral`.

**CI strategy**: `e2e-build` job builds the app and seeds the database. `e2e-seeded` and `e2e-ephemeral` jobs run in parallel on separate runners. All tests use stub extractors (`USE_STUB_EXTRACTORS=true`).

## Writing new tests

### Use the seeded account for read-only / interaction tests

Add `{ tag: "@seeded" }` to the describe block so it routes to the seeded project.

```ts
import { SEEDED_USER, signIn, resetTestData } from "./helpers";

test.describe("my seeded tests", { tag: "@seeded" }, () => {
  test.afterEach(async () => {
    await resetTestData(SEEDED_USER.email); // clears reactions/bookmarks, preserves posts
  });

  test("my interaction test", async ({ page }) => {
    await signIn(page, SEEDED_USER.email, SEEDED_USER.password);
    await page.goto("/app/feed?noAutoServe"); // prevents auto-serve (noAutoGenerate also works)
    // ... test interactions
  });
});
```

### Use ephemeral accounts for upload/mutation tests

```ts
import { signUp, cleanupTestData } from "./helpers";

let ephemeralEmail: string;

test.beforeEach(async ({ page }) => {
  const { email } = await signUp(page); // creates unique account, redirects to /library
  ephemeralEmail = email;
});

test.afterEach(async () => {
  await cleanupTestData(ephemeralEmail); // deletes all user data
});
```

## Query params for test control

- `?noAutoServe` — prevents the feed auto-serve hook from firing (saves AI calls). `?noAutoGenerate` is accepted as a backward-compatible alias
- `?count=N` — limits feed generation to N posts (useful for tests that need generation but fewer posts)

## Common pitfalls

- **Navigation links are `role="button"` not `role="link"`** — the header uses shadcn `Button` with `render={<Link>}`, which produces button-role elements. Use `getByRole("button")` to find nav links
- **Always clean up** — use `afterEach` with `cleanupTestData` (ephemeral) or `resetTestData` (seeded)
- **Don't rely on timing** — use `await expect(...).toBeVisible({ timeout })` instead of `waitForTimeout`
- **Toast text must match source code exactly** — the upload page uses Sonner toasts. URL tab shows "Submitted for processing." with a library link; text tab shows "Added **{title}**." with a library link. Use `[data-sonner-toast]` selector for toast elements.
- **`getByText` can match multiple elements** — if test content contains words like "processing", a `getByText(/processing/i)` may match both the button and the content. Target specific elements with `data-testid` or `locator().toContainText()`.
- **URL extraction is asynchronous** — `createFromUrl` succeeds synchronously (creates document record), extraction happens in the pipeline. Unreachable URLs get a neutral success toast; the error surfaces as `status="error"` in the library later. See the skipped P0-8 test.

## API routes for test data management

E2E test data operations call Convex HTTP actions directly (bypassing TanStack Start) with a shared secret.

| Route              | Method | Purpose                                             |
| ------------------ | ------ | --------------------------------------------------- |
| `/api/e2e-seed`    | POST   | Seeds documents, chunks, and posts (idempotent)     |
| `/api/e2e-reset`   | POST   | Clears reactions and bookmarks, preserves structure |
| `/api/e2e-cleanup` | POST   | Deletes ALL user data (documents, posts, bookmarks) |

All routes are on the Convex site URL (`VITE_CONVEX_SITE_URL`), require the `x-e2e-secret` header, and accept `{ email }` in the JSON body. Only emails matching `e2e-*@test.scrollect.dev` are accepted.

## Running tests

```bash
# Full suite
cd apps/e2e && npx playwright test

# Single project
npx playwright test --project=seeded
npx playwright test --project=ephemeral

# Single file
npx playwright test feed-interactions.spec.ts

# View report
npx playwright show-report
```

## URL ingestion test data-testid selectors

| Selector                             | Element                            |
| ------------------------------------ | ---------------------------------- |
| `[data-testid="url-input"]`          | URL text input on Paste URL tab    |
| `[data-testid="url-submit"]`         | Submit button on Paste URL tab     |
| `[data-testid="url-type-badge"]`     | YouTube/Article badge on URL input |
| `[data-testid="text-content-input"]` | Textarea on Paste Text tab         |
| `[data-testid="text-submit"]`        | Submit button on Paste Text tab    |
| `[data-testid="file-input"]`         | File input on Upload File tab      |
