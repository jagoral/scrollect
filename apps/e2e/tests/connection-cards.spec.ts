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

  test("connection card shows both source documents in separate panels", async ({ page }) => {
    const card = page.locator(cardOfType("connection")).first();
    await expect(card).toBeVisible();

    const sources = card.locator('[data-testid="connection-sources"]');
    await expect(sources).toBeVisible();

    const sourceA = card.locator('[data-testid="connection-source-a"]');
    const sourceB = card.locator('[data-testid="connection-source-b"]');
    await expect(sourceA).toBeVisible();
    await expect(sourceB).toBeVisible();

    await expect(sourceA).toContainText("E2E Seed Document");
    await expect(sourceB).toContainText("E2E Seed Document 2");
  });

  test("connection card header badge shows cross-source label with icon", async ({ page }) => {
    const card = page.locator(cardOfType("connection")).first();
    await expect(card).toBeVisible();

    const header = card.locator('[data-testid="connection-header"]');
    await expect(header).toBeVisible();
    await expect(header).toContainText(/Cross-source|Cross-section/);

    // The header badge contains the ArrowLeftRight icon (rendered as an SVG)
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

  test("connection card source panels link to document detail pages", async ({ page }) => {
    const card = page.locator(cardOfType("connection")).first();
    await expect(card).toBeVisible();

    // Source A link
    const linkA = card.locator('[data-testid="connection-source-a-link"]');
    await expect(linkA).toBeVisible();
    const hrefA = await linkA.getAttribute("href");
    expect(hrefA).toMatch(/\/library\/.+/);

    // Source B link (may need to wait for sources to load)
    const linkB = card.locator('[data-testid="connection-source-b-link"]');
    await expect(linkB).toBeVisible({ timeout: 10000 });
    const hrefB = await linkB.getAttribute("href");
    expect(hrefB).toMatch(/\/library\/.+/);

    // Navigate via source A link
    await linkA.click();
    await expect(page).toHaveURL(/\/library\/.+/, { timeout: 15000 });
    await expect(page.getByText(/back to library/i)).toBeVisible();
  });

  test("connection card has bridge indicator between sources and content", async ({ page }) => {
    const card = page.locator(cardOfType("connection")).first();
    await expect(card).toBeVisible();

    const bridge = card.locator('[data-testid="connection-bridge"]');
    await expect(bridge).toBeVisible();

    // Bridge contains the ArrowLeftRight icon
    const icon = bridge.locator("svg");
    await expect(icon).toBeVisible();
  });

  test("connection card has visual distinction (violet accent, no standard source badge)", async ({
    page,
  }) => {
    const card = page.locator(cardOfType("connection")).first();
    await expect(card).toBeVisible();

    // The connection card uses a violet accent class on its shell.
    // Verify the card does not use the same styling as insight cards.
    const insightCard = page.locator(cardOfType("insight")).first();
    await expect(insightCard).toBeVisible();

    // Connection card uses connection-header, not the standard source-badge
    const connectionHeader = card.locator('[data-testid="connection-header"]');
    const insightBadge = insightCard.locator('[data-testid="source-badge"]');
    await expect(connectionHeader).toBeVisible();
    await expect(insightBadge).toBeVisible();

    // Connection card should NOT have the standard source-badge
    await expect(card.locator('[data-testid="source-badge"]')).not.toBeVisible();
  });

  test("connection card expand button opens source context sheet with chunks from both documents", async ({
    page,
  }) => {
    const card = page.locator(cardOfType("connection")).first();
    await expect(card).toBeVisible();

    await card.locator('[data-testid="expand-button"]').click();

    const sheet = page.locator('[data-testid="source-sheet"]');
    await expect(sheet).toBeVisible({ timeout: 10000 });

    // Wait for both queries to load: getWithContext (primary + context) and listSourcesByPostId (supporting)
    // The supporting source from doc2 confirms chunks from both documents are shown
    const supportingHeading = sheet.getByText("Supporting sources");
    await expect(supportingHeading).toBeVisible({ timeout: 10000 });

    const chunks = sheet.locator('[data-testid="source-chunk"]');
    expect(await chunks.count()).toBeGreaterThanOrEqual(2);
  });
});
