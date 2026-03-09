import { test, expect } from "@playwright/test";

import { SEEDED_USER, resetTestData, signIn } from "./helpers";

test.describe("Source provenance on feed cards", () => {
  test.setTimeout(60000);

  test.afterEach(async ({ page }) => {
    await resetTestData(page);
  });

  test("source badge displays on feed cards with document info", async ({ page }) => {
    await signIn(page, SEEDED_USER.email, SEEDED_USER.password);
    await page.goto("/feed?noAutoGenerate");

    const firstCard = page.locator('[data-testid="post-card"]').first();
    await expect(firstCard).toBeVisible({ timeout: 15000 });

    // Source badge should be visible on the card
    const sourceBadge = firstCard.locator('[data-testid="source-badge"]');
    await expect(sourceBadge).toBeVisible({ timeout: 10000 });

    // Badge should contain the document title
    await expect(sourceBadge).toContainText("E2E Seed Document");
  });

  test("source badge links to document detail with chunk query param", async ({ page }) => {
    await signIn(page, SEEDED_USER.email, SEEDED_USER.password);
    await page.goto("/feed?noAutoGenerate");

    const firstCard = page.locator('[data-testid="post-card"]').first();
    await expect(firstCard).toBeVisible({ timeout: 15000 });

    // The source badge should be a link (rendered as <a> via Next.js Link)
    const sourceBadge = firstCard.locator('[data-testid="source-badge"]');
    await expect(sourceBadge).toBeVisible({ timeout: 10000 });

    // Verify it has an href pointing to the library detail page with a chunk param
    const href = await sourceBadge.getAttribute("href");
    expect(href).toMatch(/\/library\/.+\?chunk=\d+/);

    // Click the badge to navigate
    await sourceBadge.click();
    await expect(page).toHaveURL(/\/library\/.+\?chunk=\d+/, { timeout: 15000 });
  });

  test("expand button opens source context sheet", async ({ page }) => {
    await signIn(page, SEEDED_USER.email, SEEDED_USER.password);
    await page.goto("/feed?noAutoGenerate");

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

  test("document detail highlights chunk from URL query param", async ({ page }) => {
    await signIn(page, SEEDED_USER.email, SEEDED_USER.password);
    await page.goto("/feed?noAutoGenerate");

    const firstCard = page.locator('[data-testid="post-card"]').first();
    await expect(firstCard).toBeVisible({ timeout: 15000 });

    // Get the source badge href so we can navigate directly
    const sourceBadge = firstCard.locator('[data-testid="source-badge"]');
    await expect(sourceBadge).toBeVisible({ timeout: 10000 });
    const href = await sourceBadge.getAttribute("href");
    expect(href).toBeTruthy();

    // Navigate to the document detail page with chunk param
    await page.goto(href!);

    // The highlighted chunk should be present
    const highlightedChunk = page.locator('[data-testid="highlighted-chunk"]');
    await expect(highlightedChunk).toBeVisible({ timeout: 15000 });

    // The highlighted chunk should show the "Linked from feed" badge
    await expect(highlightedChunk).toContainText("Linked from feed");
  });
});
