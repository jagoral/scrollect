# E2E Test Best Practices

## Architecture

- **Setup project** (`global-setup.ts`) runs once before all tests — creates/seeds a shared E2E account
- **Seeded account** (`e2e-seeded-account@test.scrollect.dev`) has pre-populated data (documents, chunks, posts) for tests that don't need fresh state
- **Ephemeral accounts** (via `testUser()`) are used when tests need clean state (e.g., upload tests)
- Shared helpers live in `tests/helpers.ts` — never duplicate auth/data helpers across spec files

## Test tiers

| Tier   | Account type | Data setup                      | OpenAI cost     | Example                    |
| ------ | ------------ | ------------------------------- | --------------- | -------------------------- |
| Fast   | Seeded       | Pre-populated via `seedE2EData` | $0              | Feed interactions, card UI |
| Medium | Ephemeral    | Upload + wait for processing    | Embedding only  | Upload flow, library       |
| Slow   | Ephemeral    | Upload + process + generate     | Embedding + GPT | Full pipeline (avoid)      |

Prefer **fast** tests. Only use medium/slow when testing the actual upload or generation pipeline.

## Writing new tests

### Use the seeded account for read-only / interaction tests

```ts
import { SEEDED_USER, signIn, resetTestData } from "./helpers";

test.afterEach(async ({ page }) => {
  await resetTestData(page); // clears reactions/bookmarks, preserves posts
});

test("my interaction test", async ({ page }) => {
  await signIn(page, SEEDED_USER.email, SEEDED_USER.password);
  await page.goto("/feed?noAutoGenerate"); // prevents auto-generation
  // ... test interactions
});
```

### Use ephemeral accounts for upload/mutation tests

```ts
import { signUp, cleanupTestData } from "./helpers";

test.beforeEach(async ({ page }) => {
  await signUp(page); // creates unique account, redirects to /library
});

test.afterEach(async ({ page }) => {
  await cleanupTestData(page); // deletes all user data
});
```

## Query params for test control

- `?noAutoGenerate` — prevents the feed auto-generation hook from firing (saves OpenAI calls)
- `?count=N` — limits feed generation to N posts (useful for tests that need generation but fewer posts)

## Common pitfalls

- **Navigation links are `role="button"` not `role="link"`** — the header uses shadcn `Button` with `render={<Link>}`, which produces button-role elements. Use `getByRole("button")` to find nav links
- **Always clean up** — use `afterEach` with `cleanupTestData` (ephemeral) or `resetTestData` (seeded)
- **Don't rely on timing** — use `await expect(...).toBeVisible({ timeout })` instead of `waitForTimeout`
- **Port 3001 must be free** — run `kill -9 $(lsof -t -i:3001)` before tests if the dev server crashed

## API routes for test data management

| Route              | Method | Purpose                                             |
| ------------------ | ------ | --------------------------------------------------- |
| `/api/e2e-seed`    | POST   | Seeds documents, chunks, and posts (idempotent)     |
| `/api/e2e-reset`   | POST   | Clears reactions and bookmarks, preserves structure |
| `/api/e2e-cleanup` | POST   | Deletes ALL user data (documents, posts, bookmarks) |

All routes require authentication and only work for emails matching `e2e-*@test.scrollect.dev`.

## Running tests

```bash
# Full suite
cd apps/e2e && npx playwright test

# Single file
npx playwright test feed-interactions.spec.ts

# CI mode
npx playwright test --workers=1 --retries=2

# View report
npx playwright show-report
```
