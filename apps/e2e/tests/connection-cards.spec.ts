import { test, expect } from "@playwright/test";

import { SEEDED_USER, resetTestData, signInToSeededFeed } from "./helpers";

const CARD = '[data-testid="post-card"]';

function cardOfType(type: string) {
  return `${CARD}[data-card-type="${type}"]`;
}

test.describe("Connection card rendering (seeded)", () => {
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

  test("connection card shows provenance line with both source titles", async ({ page }) => {
    const card = page.locator(cardOfType("connection")).first();
    await expect(card).toBeVisible();

    const provenance = card.locator('[data-testid="connection-provenance"]');
    await expect(provenance).toBeVisible();
    await expect(provenance).toContainText("Connecting:");
    await expect(provenance).toContainText("E2E Seed Document");
    await expect(provenance).toContainText("E2E Seed Document 2");
  });

  test("connection card header badge shows cross-source label with icon", async ({ page }) => {
    const card = page.locator(cardOfType("connection")).first();
    await expect(card).toBeVisible();

    const header = card.locator('[data-testid="connection-header"]');
    await expect(header).toBeVisible();
    await expect(header).toContainText(/Cross-source|Cross-section/);

    const icon = header.locator("svg");
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

  test("connection card has visual distinction (violet accent, no standard source badge)", async ({
    page,
  }) => {
    const card = page.locator(cardOfType("connection")).first();
    await expect(card).toBeVisible();

    const insightCard = page.locator(cardOfType("insight")).first();
    await expect(insightCard).toBeVisible();

    // Connection card uses connection-header + connection-provenance, not source-badge
    const connectionHeader = card.locator('[data-testid="connection-header"]');
    const connectionProvenance = card.locator('[data-testid="connection-provenance"]');
    const insightBadge = insightCard.locator('[data-testid="source-badge"]');
    await expect(connectionHeader).toBeVisible();
    await expect(connectionProvenance).toBeVisible();
    await expect(insightBadge).toBeVisible();

    // Connection card should NOT have the standard source-badge
    await expect(card.locator('[data-testid="source-badge"]')).not.toBeVisible();
  });

  test("expand sheet shows source panels with both documents and bridge indicator", async ({
    page,
  }) => {
    const card = page.locator(cardOfType("connection")).first();
    await expect(card).toBeVisible();

    await card.locator('[data-testid="expand-button"]').click();

    const sheet = page.locator('[data-testid="source-sheet"]');
    await expect(sheet).toBeVisible({ timeout: 10000 });

    // Source panels are now in the sheet
    const sheetSources = sheet.locator('[data-testid="connection-sheet-sources"]');
    await expect(sheetSources).toBeVisible({ timeout: 10000 });

    const sourceA = sheet.locator('[data-testid="connection-source-a"]');
    const sourceB = sheet.locator('[data-testid="connection-source-b"]');
    await expect(sourceA).toContainText("E2E Seed Document");
    await expect(sourceB).toContainText("E2E Seed Document 2");

    // Bridge indicator is in the sheet
    const bridge = sheet.locator('[data-testid="connection-bridge"]');
    await expect(bridge).toBeVisible();
  });

  test("expand sheet source panels link to document detail pages", async ({ page }) => {
    const card = page.locator(cardOfType("connection")).first();
    await expect(card).toBeVisible();

    await card.locator('[data-testid="expand-button"]').click();

    const sheet = page.locator('[data-testid="source-sheet"]');
    await expect(sheet).toBeVisible({ timeout: 10000 });

    // Source A link
    const linkA = sheet.locator('[data-testid="connection-source-a-link"]');
    await expect(linkA).toBeVisible({ timeout: 10000 });
    const hrefA = await linkA.getAttribute("href");
    expect(hrefA).toMatch(/\/library\/.+/);

    // Source B link
    const linkB = sheet.locator('[data-testid="connection-source-b-link"]');
    await expect(linkB).toBeVisible({ timeout: 10000 });
    const hrefB = await linkB.getAttribute("href");
    expect(hrefB).toMatch(/\/library\/.+/);
  });

  test("connection card expand button also shows source chunks", async ({ page }) => {
    const card = page.locator(cardOfType("connection")).first();
    await expect(card).toBeVisible();

    await card.locator('[data-testid="expand-button"]').click();

    const sheet = page.locator('[data-testid="source-sheet"]');
    await expect(sheet).toBeVisible({ timeout: 10000 });

    const primaryChunk = sheet.locator('[data-testid="source-chunk"]').first();
    await expect(primaryChunk).toBeVisible({ timeout: 10000 });
  });
});
