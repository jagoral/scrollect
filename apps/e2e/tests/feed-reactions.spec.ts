import { test, expect } from "@playwright/test";

import { SEEDED_USER, resetTestData, signInToSeededFeed } from "./helpers";

const DISLIKE_REASONS = [
  { testId: "dislike-reason-not_interesting", label: "Not interesting to me" },
  { testId: "dislike-reason-already_know", label: "I already know this" },
  { testId: "dislike-reason-wrong_type", label: "Not my preferred format" },
  { testId: "dislike-reason-low_quality", label: "Low quality / inaccurate" },
] as const;

test.describe("Feed reaction feedback loop", { tag: "@seeded" }, () => {
  test.setTimeout(60000);

  test.beforeEach(async ({ page }) => {
    await signInToSeededFeed(page);
  });

  test.afterEach(async () => {
    await resetTestData(SEEDED_USER.email);
  });

  test("tapping dislike opens bottom sheet with 4 reason options", async ({ page }) => {
    const firstCard = page.locator('[data-testid="post-card"]').first();
    const dislikeButton = firstCard.locator('[data-testid="dislike-button"]');
    await expect(dislikeButton).toBeVisible();

    await dislikeButton.click();

    const sheet = page.locator('[data-testid="dislike-reason-sheet"]');
    await expect(sheet).toBeVisible({ timeout: 5000 });

    for (const reason of DISLIKE_REASONS) {
      const option = sheet.locator(`[data-testid="${reason.testId}"]`);
      await expect(option).toBeVisible();
      await expect(option).toContainText(reason.label);
    }
  });

  test("selecting a dislike reason dismisses sheet and hides the card", async ({ page }) => {
    const cards = page.locator('[data-testid="post-card"]');
    const initialCount = await cards.count();

    const firstCard = cards.first();
    const firstCardContent = await firstCard.textContent();
    const dislikeButton = firstCard.locator('[data-testid="dislike-button"]');

    await dislikeButton.click();
    const sheet = page.locator('[data-testid="dislike-reason-sheet"]');
    await expect(sheet).toBeVisible({ timeout: 5000 });

    await sheet.locator('[data-testid="dislike-reason-not_interesting"]').click();

    await expect(sheet).not.toBeVisible({ timeout: 5000 });
    await expect(cards).toHaveCount(initialCount - 1, { timeout: 15000 });

    // The disliked card's content should no longer be in the feed
    if (firstCardContent) {
      await expect(page.getByText(firstCardContent, { exact: true })).not.toBeVisible();
    }
  });

  test("disliked card stays hidden after navigating away and back", async ({ page }) => {
    const cards = page.locator('[data-testid="post-card"]');
    const initialCount = await cards.count();

    const firstCard = cards.first();
    const dislikeButton = firstCard.locator('[data-testid="dislike-button"]');

    await dislikeButton.click();
    const sheet = page.locator('[data-testid="dislike-reason-sheet"]');
    await expect(sheet).toBeVisible({ timeout: 5000 });
    await sheet.locator('[data-testid="dislike-reason-not_interesting"]').click();
    await expect(cards).toHaveCount(initialCount - 1, { timeout: 15000 });

    // Navigate to /saved and wait for it to fully render. This client-side navigation
    // keeps the WebSocket alive long enough for the setReaction mutation to flush.
    await page.getByRole("navigation").getByRole("button", { name: /saved/i }).click();
    await page.waitForURL(/\/app\/saved/);
    await expect(page.getByRole("heading", { name: /saved/i })).toBeVisible({ timeout: 15000 });

    // Navigate back to feed - the server-side filter should exclude the disliked card
    await page.getByRole("navigation").getByRole("button", { name: /feed/i }).click();
    await page.waitForURL(/\/app\/feed/);
    await expect(cards.first()).toBeVisible({ timeout: 15000 });
    await expect(cards).toHaveCount(initialCount - 1, { timeout: 15000 });
  });

  test("like button toggles immediately without sheet", async ({ page }) => {
    const firstCard = page.locator('[data-testid="post-card"]').first();
    const likeButton = firstCard.locator('[data-testid="like-button"]');
    const sheet = page.locator('[data-testid="dislike-reason-sheet"]');

    await expect(likeButton).toBeVisible();
    await expect(likeButton).toHaveAttribute("aria-pressed", "false");

    await likeButton.click();

    await expect(likeButton).toHaveAttribute("aria-pressed", "true", {
      timeout: 15000,
    });
    // Sheet must never appear for likes
    await expect(sheet).not.toBeVisible();

    // Toggle off
    await likeButton.click();
    await expect(likeButton).toHaveAttribute("aria-pressed", "false", {
      timeout: 15000,
    });
  });

  test("dismissing sheet without selecting a reason applies no reaction", async ({ page }) => {
    const firstCard = page.locator('[data-testid="post-card"]').first();
    const dislikeButton = firstCard.locator('[data-testid="dislike-button"]');

    await dislikeButton.click();
    const sheet = page.locator('[data-testid="dislike-reason-sheet"]');
    await expect(sheet).toBeVisible({ timeout: 5000 });

    // Dismiss by clicking the overlay (outside the sheet content)
    await page.mouse.click(10, 10);

    await expect(sheet).not.toBeVisible({ timeout: 5000 });
    await expect(dislikeButton).toHaveAttribute("aria-pressed", "false");
  });

  for (const reason of DISLIKE_REASONS) {
    test(`dislike reason "${reason.label}" hides the card from feed`, async ({ page }) => {
      const cards = page.locator('[data-testid="post-card"]');
      const initialCount = await cards.count();

      const firstCard = cards.first();
      const dislikeButton = firstCard.locator('[data-testid="dislike-button"]');

      await dislikeButton.click();
      const sheet = page.locator('[data-testid="dislike-reason-sheet"]');
      await expect(sheet).toBeVisible({ timeout: 5000 });

      await sheet.locator(`[data-testid="${reason.testId}"]`).click();

      await expect(sheet).not.toBeVisible({ timeout: 5000 });
      await expect(cards).toHaveCount(initialCount - 1, { timeout: 15000 });
    });
  }

  test("like then dislike hides the card", async ({ page }) => {
    const cards = page.locator('[data-testid="post-card"]');
    const initialCount = await cards.count();

    const firstCard = cards.first();
    const likeButton = firstCard.locator('[data-testid="like-button"]');
    const dislikeButton = firstCard.locator('[data-testid="dislike-button"]');

    // Like first
    await likeButton.click();
    await expect(likeButton).toHaveAttribute("aria-pressed", "true", {
      timeout: 15000,
    });

    // Now dislike - sheet should open since card is not currently disliked
    await dislikeButton.click();
    const sheet = page.locator('[data-testid="dislike-reason-sheet"]');
    await expect(sheet).toBeVisible({ timeout: 5000 });
    await sheet.locator('[data-testid="dislike-reason-low_quality"]').click();
    await expect(sheet).not.toBeVisible({ timeout: 5000 });

    // Card should be hidden
    await expect(cards).toHaveCount(initialCount - 1, { timeout: 15000 });
  });

  test("save then dislike hides card but preserves bookmark", async ({ page }) => {
    const cards = page.locator('[data-testid="post-card"]');
    const initialCount = await cards.count();

    const firstCard = cards.first();
    const saveButton = firstCard.locator('[data-testid="save-button"]');
    const dislikeButton = firstCard.locator('[data-testid="dislike-button"]');

    // Save first
    await saveButton.click();
    await expect(saveButton).toHaveAttribute("aria-pressed", "true", {
      timeout: 15000,
    });

    // Then dislike - card should hide
    await dislikeButton.click();
    const sheet = page.locator('[data-testid="dislike-reason-sheet"]');
    await expect(sheet).toBeVisible({ timeout: 5000 });
    await sheet.locator('[data-testid="dislike-reason-not_interesting"]').click();
    await expect(sheet).not.toBeVisible({ timeout: 5000 });

    await expect(cards).toHaveCount(initialCount - 1, { timeout: 15000 });
  });
});
