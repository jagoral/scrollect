import { test, expect } from "@playwright/test";

import { SEEDED_USER, resetTestData, signInToSeededFeed } from "./helpers";

test.describe("Source provenance on feed cards", { tag: "@seeded" }, () => {
  test.setTimeout(60000);

  test.beforeEach(async ({ page }) => {
    await signInToSeededFeed(page);
  });

  test.afterEach(async () => {
    await resetTestData(SEEDED_USER.email);
  });

  test("source badge displays on feed cards with document info", async ({ page }) => {
    const firstCard = page.locator('[data-testid="post-card"]').first();
    const sourceBadge = firstCard.locator('[data-testid="source-badge"]');
    await expect(sourceBadge).toBeVisible({ timeout: 10000 });
    await expect(sourceBadge).toContainText("E2E Seed Document");
  });

  test("source badge opens detail sheet with attribution info", async ({ page }) => {
    const firstCard = page.locator('[data-testid="post-card"]').first();
    const sourceBadge = firstCard.locator('[data-testid="source-badge"]');
    await expect(sourceBadge).toBeVisible({ timeout: 10000 });

    await sourceBadge.click();

    const sheet = page.locator('[data-testid="source-detail-sheet"]');
    await expect(sheet).toBeVisible({ timeout: 5000 });

    await expect(sheet).toContainText("E2E Seed Document");

    const libraryLink = sheet.getByRole("link", { name: /view in library/i });
    await expect(libraryLink).toBeVisible();

    await libraryLink.click();
    await expect(page).toHaveURL(/\/app\/library\/.+/, { timeout: 15000 });
    await expect(page.locator("h1").getByText("E2E Seed Document")).toBeVisible({ timeout: 10000 });
  });
});
