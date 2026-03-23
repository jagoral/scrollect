import { test, expect } from "@playwright/test";

import { SEEDED_USER, resetTestData, signInToSeededFeed } from "./helpers";

const CARD = '[data-testid="post-card"]';
const NEW_BADGE = '[data-testid="new-badge"]';

test.describe("Freshness badge on feed cards", { tag: "@seeded" }, () => {
  test.setTimeout(60000);

  test.beforeEach(async ({ page }) => {
    await signInToSeededFeed(page);
  });

  test.afterEach(async () => {
    await resetTestData(SEEDED_USER.email);
  });

  test("cards from recently uploaded documents display a New badge", async ({ page }) => {
    const cards = page.locator(CARD);
    await expect(cards.first()).toBeVisible({ timeout: 15000 });

    const badgeCount = await page.locator(NEW_BADGE).count();
    expect(badgeCount).toBeGreaterThan(0);
  });

  test("New badge contains the text New and is visible", async ({ page }) => {
    const badge = page.locator(NEW_BADGE).first();
    await expect(badge).toBeVisible({ timeout: 15000 });
    await expect(badge).toContainText("New");
  });

  test("New badge is rendered inside a post card", async ({ page }) => {
    const firstBadge = page.locator(NEW_BADGE).first();
    await expect(firstBadge).toBeVisible({ timeout: 15000 });

    const parentCard = firstBadge.locator(`xpath=ancestor::article[@data-testid="post-card"]`);
    await expect(parentCard).toBeVisible();
  });

  test("all seeded cards have New badges since documents were just created", async ({ page }) => {
    const cards = page.locator(CARD);
    await expect(cards.first()).toBeVisible({ timeout: 15000 });

    const totalCards = await cards.count();
    const totalBadges = await page.locator(NEW_BADGE).count();

    // All seeded documents were created moments ago (within 48h), so every card
    // from those documents should carry a "New" badge.
    expect(totalBadges).toBe(totalCards);
  });
});
