import { test, expect, type Page } from "@playwright/test";

import { SEEDED_USER, goToFirstDocument, resetTestData, signInToSeededFeed } from "./helpers";

async function bookmarkFirstCardAndNavigateToDocument(page: Page) {
  await signInToSeededFeed(page);

  const firstCard = page.locator('[data-testid="post-card"]').first();
  const saveButton = firstCard.locator('[data-testid="save-button"]');
  await saveButton.click();
  await expect(saveButton).toHaveAttribute("aria-pressed", "true", { timeout: 15000 });

  const sourceBadge = firstCard.locator('[data-testid="source-badge"]');
  await expect(sourceBadge).toBeVisible();
  await sourceBadge.click();

  const detailSheet = page.locator('[data-testid="source-detail-sheet"]');
  await expect(detailSheet).toBeVisible({ timeout: 10000 });
  await detailSheet.getByText(/view in library/i).click();

  await expect(page).toHaveURL(/\/app\/library\/.+/, { timeout: 15000 });
  await expect(page.locator('[data-testid="status-ready"]').first()).toBeVisible({
    timeout: 15000,
  });
}

test.describe("Bookmarked cards section on document detail page", { tag: "@seeded" }, () => {
  test.setTimeout(60000);

  test.afterEach(async () => {
    await resetTestData(SEEDED_USER.email);
  });

  test("section is hidden when document has no bookmarked cards", async ({ page }) => {
    await goToFirstDocument(page);
    // Wait for the document detail panel to fully load its Convex queries
    // by confirming a section that always renders for ready documents
    await expect(page.locator('[data-testid="status-ready"]').first()).toBeVisible({
      timeout: 15000,
    });
    await expect(page.locator('[data-testid="bookmarked-cards-section"]')).toHaveCount(0);
  });

  test("section appears with correct count after bookmarking a card", async ({ page }) => {
    await bookmarkFirstCardAndNavigateToDocument(page);

    const section = page.locator('[data-testid="bookmarked-cards-section"]');
    await expect(section).toBeVisible({ timeout: 15000 });
    await expect(section).toContainText("Bookmarked cards (1)");
  });

  test("collapsible expands to show cards and collapses to hide them", async ({ page }) => {
    await bookmarkFirstCardAndNavigateToDocument(page);

    const section = page.locator('[data-testid="bookmarked-cards-section"]');
    await expect(section).toBeVisible({ timeout: 15000 });

    const cardList = page.locator('[data-testid="bookmarked-cards-list"]');
    await expect(cardList).not.toBeVisible();

    const trigger = section.getByRole("button", { name: /bookmarked cards/i });
    await trigger.click();

    await expect(cardList).toBeVisible({ timeout: 5000 });
    const cards = cardList.locator('[data-testid="post-card"]');
    await expect(cards).toHaveCount(1);

    await trigger.click();
    await expect(cardList).not.toBeVisible({ timeout: 5000 });
  });

  test("unbookmarking the last card hides the section", async ({ page }) => {
    await bookmarkFirstCardAndNavigateToDocument(page);

    const section = page.locator('[data-testid="bookmarked-cards-section"]');
    await expect(section).toBeVisible({ timeout: 15000 });

    const trigger = section.getByRole("button", { name: /bookmarked cards/i });
    await trigger.click();

    const cardList = page.locator('[data-testid="bookmarked-cards-list"]');
    await expect(cardList).toBeVisible({ timeout: 5000 });

    const savedCard = cardList.locator('[data-testid="post-card"]').first();
    const cardSaveButton = savedCard.locator('[data-testid="save-button"]');
    await cardSaveButton.click();

    await expect(section).not.toBeVisible({ timeout: 15000 });
  });
});
