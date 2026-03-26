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

  test("selecting a dislike reason dismisses sheet and shows dislike state", async ({ page }) => {
    const firstCard = page.locator('[data-testid="post-card"]').first();
    const dislikeButton = firstCard.locator('[data-testid="dislike-button"]');

    await dislikeButton.click();
    const sheet = page.locator('[data-testid="dislike-reason-sheet"]');
    await expect(sheet).toBeVisible({ timeout: 5000 });

    await sheet.locator('[data-testid="dislike-reason-not_interesting"]').click();

    await expect(sheet).not.toBeVisible({ timeout: 5000 });
    await expect(dislikeButton).toHaveAttribute("aria-pressed", "true", {
      timeout: 15000,
    });
  });

  test("tapping dislike on already-disliked card toggles off without sheet", async ({ page }) => {
    const firstCard = page.locator('[data-testid="post-card"]').first();
    const dislikeButton = firstCard.locator('[data-testid="dislike-button"]');

    // First: dislike the card with a reason
    await dislikeButton.click();
    const sheet = page.locator('[data-testid="dislike-reason-sheet"]');
    await expect(sheet).toBeVisible({ timeout: 5000 });
    await sheet.locator('[data-testid="dislike-reason-already_know"]').click();
    await expect(sheet).not.toBeVisible({ timeout: 5000 });
    await expect(dislikeButton).toHaveAttribute("aria-pressed", "true", {
      timeout: 15000,
    });

    // Second: tap dislike again to toggle off - sheet should NOT open
    await dislikeButton.click();
    await expect(dislikeButton).toHaveAttribute("aria-pressed", "false", {
      timeout: 15000,
    });

    // Verify the sheet did not reappear at any point during toggle-off
    await expect(sheet).not.toBeVisible();
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
    // The overlay is the backdrop behind the sheet - click at the top of the viewport
    await page.mouse.click(10, 10);

    await expect(sheet).not.toBeVisible({ timeout: 5000 });
    await expect(dislikeButton).toHaveAttribute("aria-pressed", "false");
  });

  for (const reason of DISLIKE_REASONS) {
    test(`dislike reason "${reason.label}" can be selected and applied`, async ({ page }) => {
      const firstCard = page.locator('[data-testid="post-card"]').first();
      const dislikeButton = firstCard.locator('[data-testid="dislike-button"]');

      await dislikeButton.click();
      const sheet = page.locator('[data-testid="dislike-reason-sheet"]');
      await expect(sheet).toBeVisible({ timeout: 5000 });

      await sheet.locator(`[data-testid="${reason.testId}"]`).click();

      await expect(sheet).not.toBeVisible({ timeout: 5000 });
      await expect(dislikeButton).toHaveAttribute("aria-pressed", "true", {
        timeout: 15000,
      });

      // Verify toggle-off still works after each reason type
      await dislikeButton.click();
      await expect(dislikeButton).toHaveAttribute("aria-pressed", "false", {
        timeout: 15000,
      });
    });
  }

  test("dislike with reason then like switches reaction (mutual exclusivity)", async ({ page }) => {
    const firstCard = page.locator('[data-testid="post-card"]').first();
    const dislikeButton = firstCard.locator('[data-testid="dislike-button"]');
    const likeButton = firstCard.locator('[data-testid="like-button"]');

    // Dislike with reason
    await dislikeButton.click();
    const sheet = page.locator('[data-testid="dislike-reason-sheet"]');
    await expect(sheet).toBeVisible({ timeout: 5000 });
    await sheet.locator('[data-testid="dislike-reason-wrong_type"]').click();
    await expect(sheet).not.toBeVisible({ timeout: 5000 });
    await expect(dislikeButton).toHaveAttribute("aria-pressed", "true", {
      timeout: 15000,
    });

    // Now like the same card - should override the dislike
    await likeButton.click();
    await expect(likeButton).toHaveAttribute("aria-pressed", "true", {
      timeout: 15000,
    });
    await expect(dislikeButton).toHaveAttribute("aria-pressed", "false", {
      timeout: 15000,
    });
  });

  test("like then dislike shows sheet and overrides like", async ({ page }) => {
    const firstCard = page.locator('[data-testid="post-card"]').first();
    const likeButton = firstCard.locator('[data-testid="like-button"]');
    const dislikeButton = firstCard.locator('[data-testid="dislike-button"]');

    // Like first
    await likeButton.click();
    await expect(likeButton).toHaveAttribute("aria-pressed", "true", {
      timeout: 15000,
    });

    // Now dislike - sheet should still open since card is not currently disliked
    await dislikeButton.click();
    const sheet = page.locator('[data-testid="dislike-reason-sheet"]');
    await expect(sheet).toBeVisible({ timeout: 5000 });
    await sheet.locator('[data-testid="dislike-reason-low_quality"]').click();
    await expect(sheet).not.toBeVisible({ timeout: 5000 });

    await expect(dislikeButton).toHaveAttribute("aria-pressed", "true", {
      timeout: 15000,
    });
    await expect(likeButton).toHaveAttribute("aria-pressed", "false", {
      timeout: 15000,
    });
  });

  test("save button is independent of reaction state", async ({ page }) => {
    const firstCard = page.locator('[data-testid="post-card"]').first();
    const saveButton = firstCard.locator('[data-testid="save-button"]');
    const dislikeButton = firstCard.locator('[data-testid="dislike-button"]');

    // Dislike with reason
    await dislikeButton.click();
    const sheet = page.locator('[data-testid="dislike-reason-sheet"]');
    await expect(sheet).toBeVisible({ timeout: 5000 });
    await sheet.locator('[data-testid="dislike-reason-not_interesting"]').click();
    await expect(sheet).not.toBeVisible({ timeout: 5000 });
    await expect(dislikeButton).toHaveAttribute("aria-pressed", "true", {
      timeout: 15000,
    });

    // Save should work independently
    await saveButton.click();
    await expect(saveButton).toHaveAttribute("aria-pressed", "true", {
      timeout: 15000,
    });

    // Dislike state should be preserved after saving
    await expect(dislikeButton).toHaveAttribute("aria-pressed", "true");
  });
});
