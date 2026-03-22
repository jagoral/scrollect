import { test, expect } from "@playwright/test";

import { SEEDED_USER, resetTestData, signInToSeededFeed } from "./helpers";

test.describe("Feed interactions and pagination", () => {
  test.setTimeout(60000);

  test.beforeEach(async ({ page }) => {
    await signInToSeededFeed(page);
  });

  test.afterEach(async () => {
    await resetTestData(SEEDED_USER.email);
  });

  test("feed card interactions: like, dislike, mutual exclusivity, save, saved page, end state", async ({
    page,
  }) => {
    const firstCard = page.locator('[data-testid="post-card"]').first();
    await expect(firstCard.locator('[data-testid="save-button"]')).toBeVisible();
    await expect(firstCard.locator('[data-testid="like-button"]')).toBeVisible();
    await expect(firstCard.locator('[data-testid="dislike-button"]')).toBeVisible();

    // Like → verify aria-pressed
    const likeButton = firstCard.locator('[data-testid="like-button"]');
    await likeButton.click();
    await expect(likeButton).toHaveAttribute("aria-pressed", "true", { timeout: 15000 });

    // Dislike same card → verify mutual exclusivity
    const dislikeButton = firstCard.locator('[data-testid="dislike-button"]');
    await dislikeButton.click();
    await expect(dislikeButton).toHaveAttribute("aria-pressed", "true", { timeout: 15000 });
    await expect(likeButton).toHaveAttribute("aria-pressed", "false", { timeout: 15000 });

    // Clear dislike
    await dislikeButton.click();
    await expect(dislikeButton).toHaveAttribute("aria-pressed", "false", { timeout: 15000 });

    // Save → verify aria-pressed
    const saveButton = firstCard.locator('[data-testid="save-button"]');
    await saveButton.click();
    await expect(saveButton).toHaveAttribute("aria-pressed", "true", { timeout: 15000 });

    // Navigate to /saved via client-side navigation to keep the Convex WebSocket
    // alive — a full page.goto() can kill the connection before the mutation flushes.
    await page.getByRole("navigation").getByRole("button", { name: /saved/i }).click();
    await page.waitForURL(/\/app\/saved/);
    await expect(page.getByRole("heading", { name: /saved/i })).toBeVisible();
    await expect(page.locator('[data-testid="post-card"]').first()).toBeVisible({ timeout: 30000 });

    // Back to /feed → scroll to bottom → verify "all caught up"
    await page.goto("/app/feed?noAutoGenerate");
    await page.waitForLoadState("networkidle");
    await expect(page.locator('[data-testid="post-card"]').first()).toBeVisible();

    const endState = page.locator('[data-testid="feed-end-state"]');
    for (let i = 0; i < 10; i++) {
      const cardCountBefore = await page.locator('[data-testid="post-card"]').count();
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      if (await endState.isVisible()) break;
      // Wait for either new content to load (card count increases) or end state to appear
      await Promise.race([
        endState.waitFor({ state: "visible", timeout: 3000 }).catch(() => {}),
        expect(page.locator('[data-testid="post-card"]'))
          .not.toHaveCount(cardCountBefore, { timeout: 3000 })
          .catch(() => {}),
      ]);
    }

    await expect(endState).toBeVisible({ timeout: 10000 });
    await expect(endState).toContainText("all caught up");
  });
});
