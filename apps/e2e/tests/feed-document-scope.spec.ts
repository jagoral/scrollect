import { expect, test } from "@playwright/test";
import type { Locator } from "@playwright/test";

import { reseedAccount } from "./helpers";

const CARD = '[data-testid="post-card"]';
const SOURCE_BADGE = '[data-testid="source-badge"]';
const SCOPED_DOCUMENT_TITLE = "E2E Seed Document 2";

test.describe("Feed: document scope", { tag: "@seeded" }, () => {
  test.setTimeout(60_000);

  test.beforeEach(async () => {
    await reseedAccount();
  });

  test.afterEach(async () => {
    await reseedAccount();
  });

  test("opens a document feed from library and resets to all documents", async ({ page }) => {
    await page.goto("/app/library");
    await page.waitForLoadState("networkidle");

    const documentItem = page
      .locator('[data-testid="document-item"]')
      .filter({ hasText: SCOPED_DOCUMENT_TITLE })
      .first();
    await expect(documentItem).toBeVisible({ timeout: 15_000 });
    await documentItem.click();

    await page.getByRole("link", { name: /open feed for this document/i }).click();

    await expect(page).toHaveURL(/\/app\/feed\?documentId=.+/, { timeout: 15_000 });
    await expect(page.locator('[data-testid="feed-scope-banner"]')).toContainText(
      SCOPED_DOCUMENT_TITLE,
    );

    const cards = page.locator(CARD);
    await expect(cards.first()).toBeVisible({ timeout: 15_000 });
    const scopedTitles = await sourceDocumentTitles(cards);
    expect(scopedTitles.size).toBe(1);
    expect(scopedTitles.has(SCOPED_DOCUMENT_TITLE)).toBe(true);

    await page.locator('[data-testid="feed-view-all"]').click();
    await expect(page).toHaveURL(/\/app\/feed(?:\?.*)?$/, { timeout: 15_000 });
    expect(new URL(page.url()).searchParams.has("documentId")).toBe(false);
    await expect(page.locator('[data-testid="feed-scope-banner"]')).toBeHidden();

    await expect(cards.first()).toBeVisible({ timeout: 15_000 });
    const allTitles = await sourceDocumentTitles(cards);
    expect(allTitles.has(SCOPED_DOCUMENT_TITLE)).toBe(true);
  });
});

async function sourceDocumentTitles(cards: Locator) {
  const sourceBadgeTexts = await cards
    .locator(SOURCE_BADGE)
    .evaluateAll((els) => els.map((el) => el.textContent?.trim() ?? ""));

  return new Set(sourceBadgeTexts.map((text) => text.split(" - ")[0]?.trim() ?? text));
}
