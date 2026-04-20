import { test, expect } from "@playwright/test";

import { SEEDED_USER, resetTestData, signInToSeededFeed } from "./helpers";

const CARD = '[data-testid="post-card"]';

function cardOfType(type: string) {
  return `${CARD}[data-post-type="${type}"]`;
}

test.describe("Connection card rendering (seeded)", { tag: "@seeded" }, () => {
  test.setTimeout(60000);

  test.beforeEach(async ({ page }) => {
    await signInToSeededFeed(page);
  });

  test.afterEach(async () => {
    await resetTestData(SEEDED_USER.email);
  });

  test("connection card is visible in the feed", async ({ page }) => {
    const connectionCard = page.locator(cardOfType("connection")).first();
    await expect(connectionCard).toBeVisible({ timeout: 15000 });
  });

  test("connection card shows both source titles in the source A/B grid", async ({ page }) => {
    const card = page.locator(cardOfType("connection")).first();
    await expect(card).toBeVisible();

    const sourceA = card.locator('[data-testid="connection-source-a"]');
    const sourceB = card.locator('[data-testid="connection-source-b"]');
    await expect(sourceA).toBeVisible();
    await expect(sourceB).toBeVisible();

    const sourceATitle = (await sourceA.textContent())?.trim() ?? "";
    const sourceBTitle = (await sourceB.textContent())?.trim() ?? "";
    const titles = new Set([sourceATitle, sourceBTitle]);
    expect(titles.has("E2E Seed Document")).toBe(true);
    expect(titles.has("E2E Seed Document 2")).toBe(true);
  });

  test("connection card shows source A/B labels with an arrow icon", async ({ page }) => {
    const card = page.locator(cardOfType("connection")).first();
    await expect(card).toBeVisible();

    const content = card.locator('[data-testid="connection-content"]');
    await expect(content).toContainText("Source A");
    await expect(content).toContainText("Source B");

    // The ArrowLeftRight lucide icon is rendered between the two source blocks
    const icon = content.locator("svg.lucide-arrow-left-right");
    await expect(icon).toBeVisible();
  });

  test("connection card displays synthesized content", async ({ page }) => {
    const card = page.locator(cardOfType("connection")).first();
    await expect(card).toBeVisible();

    const content = card.locator('[data-testid="connection-content"]');
    await expect(content).toBeVisible();

    // Seed data content: "Both documents discuss patterns of decoupling..."
    await expect(content).toContainText("decoupling");
  });

  test("connection card has action buttons (like, dislike, save)", async ({ page }) => {
    const card = page.locator(cardOfType("connection")).first();
    await expect(card).toBeVisible();

    await expect(card.locator('[data-testid="like-button"]')).toBeVisible();
    await expect(card.locator('[data-testid="dislike-button"]')).toBeVisible();
    await expect(card.locator('[data-testid="save-button"]')).toBeVisible();
  });

  test("connection card has visual distinction via the source A/B grid", async ({ page }) => {
    const card = page.locator(cardOfType("connection")).first();
    await expect(card).toBeVisible();

    const insightCard = page.locator(cardOfType("insight")).first();
    await expect(insightCard).toBeVisible();

    // Connection cards render a dedicated source A/B grid alongside the standard
    // source-badge footer. Insight cards render only the standard source-badge.
    await expect(card.locator('[data-testid="connection-source-a"]')).toBeVisible();
    await expect(card.locator('[data-testid="connection-source-b"]')).toBeVisible();
    await expect(insightCard.locator('[data-testid="connection-source-a"]')).toHaveCount(0);
    await expect(insightCard.locator('[data-testid="source-badge"]')).toBeVisible();
  });

  test("expand sheet is removed from connection cards", async ({ page }) => {
    const card = page.locator(cardOfType("connection")).first();
    await expect(card).toBeVisible();

    await expect(card.locator('[data-testid="expand-button"]')).toHaveCount(0);
  });
});
