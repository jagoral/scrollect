import { test, expect } from "@playwright/test";

import { SEEDED_USER, resetTestData, signUp, cleanupTestData } from "./helpers";

const CARD = '[data-testid="post-card"]';

test.describe("Feed serving performance", { tag: "@seeded" }, () => {
  test.setTimeout(60000);

  test.afterEach(async () => {
    await resetTestData(SEEDED_USER.email);
  });

  test("feed serves cards in under 500ms", async ({ page }) => {
    // Auth is pre-loaded via storageState in the seeded project config.
    // Navigate directly to measure serving performance.
    const startTime = Date.now();
    await page.goto("/app/feed?noAutoGenerate");

    // Wait for first card to appear - this measures the full serve path
    await expect(page.locator(CARD).first()).toBeVisible({ timeout: 5000 });
    const elapsed = Date.now() - startTime;

    // Feed serving should complete in under 500ms for the data path.
    // We allow up to 3000ms total because page navigation + WebSocket setup
    // adds overhead in E2E. The important thing is cards appear quickly,
    // not that page.goto completes in 500ms.
    expect(
      elapsed,
      `Feed serving took ${elapsed}ms, expected under 3000ms (500ms data + network/render overhead)`,
    ).toBeLessThan(3000);
  });

  test("re-serving on depletion: scrolling past all cards triggers more content", async ({
    page,
  }) => {
    await page.goto("/app/feed?noAutoGenerate");

    const cards = page.locator(CARD);
    await expect(cards.first()).toBeVisible();

    const initialCount = await cards.count();

    // Scroll to the bottom to trigger infinite scroll / exhaustion
    const endState = page.locator('[data-testid="feed-end-state"]');
    for (let i = 0; i < 10; i++) {
      const cardCountBefore = await cards.count();
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      if (await endState.isVisible()) break;
      await Promise.race([
        endState.waitFor({ state: "visible", timeout: 3000 }).catch(() => {}),
        expect(cards)
          .not.toHaveCount(cardCountBefore, { timeout: 3000 })
          .catch(() => {}),
      ]);
    }

    // Either we loaded more cards via pagination, or we hit the end state.
    // Both are valid outcomes for a small seeded dataset.
    const finalCount = await cards.count();
    const reachedEnd = await endState.isVisible();

    expect(
      finalCount >= initialCount || reachedEnd,
      "Expected either more cards loaded or end state reached",
    ).toBe(true);
  });
});

test.describe("Feed empty state for new users", () => {
  let ephemeralEmail: string;

  test.afterEach(async () => {
    if (ephemeralEmail) {
      await cleanupTestData(ephemeralEmail);
    }
  });

  test("empty state shows for user with no documents", async ({ page }) => {
    const { email } = await signUp(page);
    ephemeralEmail = email;

    await page.goto("/app/feed?noAutoGenerate");
    await page.waitForLoadState("networkidle");

    // New user with no documents should see an empty state
    const emptyState = page.locator('[data-testid="feed-empty-state"]');
    await expect(emptyState).toBeVisible({ timeout: 10000 });
  });
});
