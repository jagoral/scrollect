import { test, expect } from "@playwright/test";

import { SEEDED_USER, resetTestData, signInToSeededFeed } from "./helpers";

test.describe("Source provenance on feed cards", () => {
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

  test("source badge links to document detail page", async ({ page }) => {
    const firstCard = page.locator('[data-testid="post-card"]').first();
    const sourceBadge = firstCard.locator('[data-testid="source-badge"]');
    await expect(sourceBadge).toBeVisible({ timeout: 10000 });

    const href = await sourceBadge.getAttribute("href");
    expect(href).toMatch(/\/library\/.+/);

    await sourceBadge.click();
    await expect(page).toHaveURL(/\/library\/.+/, { timeout: 15000 });
    await expect(page.getByText(/back to library/i)).toBeVisible();
    await expect(page.locator("h1").getByText("E2E Seed Document")).toBeVisible({ timeout: 10000 });
  });

  test("expand button opens source context sheet", async ({ page }) => {
    const firstCard = page.locator('[data-testid="post-card"]').first();
    const expandButton = firstCard.locator('[data-testid="expand-button"]');
    await expect(expandButton).toBeVisible({ timeout: 10000 });

    await expandButton.click();

    const sourceSheet = page.locator('[data-testid="source-sheet"]');
    await expect(sourceSheet).toBeVisible({ timeout: 10000 });
    await expect(sourceSheet).toContainText("E2E Seed Document");
  });
});
