import { test, expect } from "@playwright/test";

import { SEEDED_USER, resetTestData, signIn } from "./helpers";

test.describe("Source provenance on feed cards", () => {
  test.setTimeout(60000);

  test.afterEach(async () => {
    await resetTestData(SEEDED_USER.email);
  });

  test("source badge displays on feed cards with document info", async ({ page }) => {
    await signIn(page, SEEDED_USER.email, SEEDED_USER.password);
    await page.goto("/feed?noAutoGenerate");
    await page.waitForLoadState("networkidle");

    const firstCard = page.locator('[data-testid="post-card"]').first();
    await expect(firstCard).toBeVisible({ timeout: 15000 });

    // Source badge should be visible on the card
    const sourceBadge = firstCard.locator('[data-testid="source-badge"]');
    await expect(sourceBadge).toBeVisible({ timeout: 10000 });

    // Badge should contain the document title
    await expect(sourceBadge).toContainText("E2E Seed Document");
  });

  test("source badge links to document detail page", async ({ page }) => {
    await signIn(page, SEEDED_USER.email, SEEDED_USER.password);
    await page.goto("/feed?noAutoGenerate");
    await page.waitForLoadState("networkidle");

    const firstCard = page.locator('[data-testid="post-card"]').first();
    await expect(firstCard).toBeVisible({ timeout: 15000 });

    const sourceBadge = firstCard.locator('[data-testid="source-badge"]');
    await expect(sourceBadge).toBeVisible({ timeout: 10000 });

    // Verify it has an href pointing to the library detail page
    const href = await sourceBadge.getAttribute("href");
    expect(href).toMatch(/\/library\/.+/);

    // Click the badge to navigate
    await sourceBadge.click();
    await expect(page).toHaveURL(/\/library\/.+/, { timeout: 15000 });

    // Wait for the detail page to actually render (TanStack Router pending state)
    await expect(page.getByText(/back to library/i)).toBeVisible({ timeout: 15000 });

    // Should show the document title on the detail page
    await expect(page.locator("h1").getByText("E2E Seed Document")).toBeVisible({ timeout: 10000 });
  });

  test("expand button opens source context sheet", async ({ page }) => {
    await signIn(page, SEEDED_USER.email, SEEDED_USER.password);
    await page.goto("/feed?noAutoGenerate");
    await page.waitForLoadState("networkidle");

    const firstCard = page.locator('[data-testid="post-card"]').first();
    await expect(firstCard).toBeVisible({ timeout: 15000 });

    // Expand button should be visible
    const expandButton = firstCard.locator('[data-testid="expand-button"]');
    await expect(expandButton).toBeVisible({ timeout: 10000 });

    // Click expand button to open the sheet
    await expandButton.click();

    // The source sheet content should become visible
    const sourceSheet = page.locator('[data-testid="source-sheet"]');
    await expect(sourceSheet).toBeVisible({ timeout: 10000 });

    // Sheet should contain the document title
    await expect(sourceSheet).toContainText("E2E Seed Document");
  });
});
