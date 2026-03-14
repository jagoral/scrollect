import { test, expect } from "@playwright/test";

import { SEEDED_USER, resetTestData, signIn } from "./helpers";

test.describe("Feed interactions and pagination", () => {
  test.setTimeout(60000);

  test.afterEach(async ({ page }) => {
    await resetTestData(page);
  });

  test("feed card interactions: like, dislike, mutual exclusivity, save, saved page, end state", async ({
    page,
  }) => {
    await signIn(page, SEEDED_USER.email, SEEDED_USER.password);
    await page.goto("/feed?noAutoGenerate");
    await page.waitForLoadState("networkidle");

    // Verify cards visible with all 3 buttons
    const firstCard = page.locator('[data-testid="post-card"]').first();
    await expect(firstCard).toBeVisible({ timeout: 15000 });
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
    await page.waitForURL(/\/saved/);
    await expect(page.getByRole("heading", { name: /saved/i })).toBeVisible({ timeout: 15000 });
    await expect(page.locator('[data-testid="post-card"]').first()).toBeVisible({ timeout: 30000 });

    // Back to /feed → scroll to bottom → verify "all caught up"
    await page.goto("/feed?noAutoGenerate");
    await page.waitForLoadState("networkidle");
    await expect(page.locator('[data-testid="post-card"]').first()).toBeVisible({ timeout: 15000 });

    for (let i = 0; i < 10; i++) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(500);
      const endState = page.locator('[data-testid="feed-end-state"]');
      if (await endState.isVisible()) break;
    }

    await expect(page.locator('[data-testid="feed-end-state"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-testid="feed-end-state"]')).toContainText("all caught up");
  });
});
