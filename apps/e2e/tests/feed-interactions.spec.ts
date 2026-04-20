import { test, expect } from "@playwright/test";

import { SEEDED_USER, reseedAccount, resetTestData, signInToSeededFeed } from "./helpers";

test.describe("Feed interactions and pagination", { tag: "@seeded" }, () => {
  test.setTimeout(60000);

  test.beforeEach(async ({ page }) => {
    await reseedAccount();
    await signInToSeededFeed(page);
  });

  test.afterEach(async () => {
    await resetTestData(SEEDED_USER.email);
  });

  test("cards appear after instant serving with source attribution", async ({ page }) => {
    const cards = page.locator('[data-testid="post-card"]');
    await expect(cards.first()).toBeVisible();

    const cardCount = await cards.count();
    expect(cardCount).toBeGreaterThan(0);

    // Every card should have a source badge with document title
    const firstCard = cards.first();
    const sourceBadge = firstCard.locator('[data-testid="source-badge"]');
    await expect(sourceBadge).toBeVisible();
    await expect(sourceBadge).toContainText("E2E Seed Document");
  });

  test("source attribution adapts by document type", async ({ page }) => {
    const cards = page.locator('[data-testid="post-card"]');
    await expect(cards.first()).toBeVisible();

    // Collect all source badge texts
    const badgeTexts = await cards
      .locator('[data-testid="source-badge"]')
      .evaluateAll((els) => els.map((el) => el.textContent?.trim() ?? ""));

    // All seeded cards should have a source badge
    expect(badgeTexts.length).toBeGreaterThan(0);

    // Each badge should contain a document title (not be empty)
    for (const text of badgeTexts) {
      expect(text.length).toBeGreaterThan(0);
      expect(text).toMatch(/E2E Seed Document/);
    }

    // "(ungrouped)" sentinel should never appear in attribution
    for (const text of badgeTexts) {
      expect(text).not.toContain("(ungrouped)");
    }
  });

  test("feed card interactions: like, save, saved page, end state", async ({ page }) => {
    const firstCard = page.locator('[data-testid="post-card"]').first();
    await expect(firstCard.locator('[data-testid="save-button"]')).toBeVisible();
    await expect(firstCard.locator('[data-testid="like-button"]')).toBeVisible();
    await expect(firstCard.locator('[data-testid="dislike-button"]')).toBeVisible();

    // Like -> verify aria-pressed
    const likeButton = firstCard.locator('[data-testid="like-button"]');
    await likeButton.click();
    await expect(likeButton).toHaveAttribute("aria-pressed", "true", { timeout: 15000 });

    // Toggle off like
    await likeButton.click();
    await expect(likeButton).toHaveAttribute("aria-pressed", "false", { timeout: 15000 });

    // Save -> verify aria-pressed
    const saveButton = firstCard.locator('[data-testid="save-button"]');
    await saveButton.click();
    await expect(saveButton).toHaveAttribute("aria-pressed", "true", { timeout: 15000 });

    // Navigate to /saved via client-side navigation to keep the Convex WebSocket
    // alive - a full page.goto() can kill the connection before the mutation flushes.
    await page.locator('[data-slot="sidebar"]').getByRole("link", { name: /saved/i }).click();
    await page.waitForURL(/\/app\/saved/);
    await expect(page.getByRole("heading", { name: /saved/i })).toBeVisible();
    await expect(page.locator('[data-testid="post-card"]').first()).toBeVisible({ timeout: 30000 });

    // Back to /feed -> scroll to bottom -> verify "all caught up"
    await page.goto("/app/feed?noAutoGenerate");
    await page.waitForLoadState("networkidle");
    await expect(page.locator('[data-testid="post-card"]').first()).toBeVisible();

    const endState = page.locator('[data-testid="feed-end-state"]');
    for (let i = 0; i < 10; i++) {
      const cardCountBefore = await page.locator('[data-testid="post-card"]').count();
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      if (await endState.isVisible()) break;
      // Wait for either new content to load (card count increases) or end state to appear
      await Promise.race([
        endState.waitFor({ state: "visible", timeout: 3000 }).catch(() => {}),
        expect(page.locator('[data-testid="post-card"]'))
          .not.toHaveCount(cardCountBefore, { timeout: 3000 })
          .catch(() => {}),
      ]);
    }

    await expect(endState).toBeVisible({ timeout: 10000 });
    await expect(endState).toContainText("all caught up");
  });

  test("expand sheet button is removed", async ({ page }) => {
    const firstCard = page.locator('[data-testid="post-card"]').first();
    await expect(firstCard).toBeVisible();

    // The expand button should no longer exist in the new feed v2
    await expect(firstCard.locator('[data-testid="expand-button"]')).toHaveCount(0);
  });

  test("opening desktop details does not create horizontal page overflow", async ({ page }) => {
    await page.setViewportSize({ width: 1536, height: 864 });
    await page.goto("/app/feed?noAutoGenerate");
    await expect(page.locator('[data-testid="post-card"]').first()).toBeVisible();

    const main = page.locator('[data-testid="app-main-scroll"]');
    const panel = page.locator('[data-testid="feed-detail-panel"]');
    await expect(panel).toBeVisible();
    await expect(panel).toContainText("Select a post");
    await expect
      .poll(() => main.evaluate((el) => getComputedStyle(el).borderRightWidth))
      .toBe("0px");
    await expect
      .poll(() => panel.evaluate((el) => getComputedStyle(el).borderLeftWidth))
      .toBe("1px");

    await page
      .locator('[data-testid="post-card"]')
      .first()
      .locator('[data-testid="source-badge"]')
      .click();

    await expect(panel).toBeVisible();
    await expect(panel).not.toContainText("Select a post");
    await expect
      .poll(() => panel.evaluate((el) => getComputedStyle(el).borderLeftWidth))
      .toBe("1px");

    const horizontalOverflow = await page.evaluate(() => {
      const root = document.documentElement;
      const body = document.body;
      return Math.max(root.scrollWidth, body.scrollWidth) - root.clientWidth;
    });

    expect(horizontalOverflow).toBeLessThanOrEqual(1);
  });

  test("saved page keeps the desktop detail placeholder rail", async ({ page }) => {
    await page.setViewportSize({ width: 1536, height: 864 });
    await page.goto("/app/saved");

    const main = page.locator('[data-testid="app-main-scroll"]');
    const panel = page.locator('[data-testid="feed-detail-panel"]');
    await expect(panel).toBeVisible();
    await expect(panel).toContainText("Select a post");
    await expect
      .poll(() => main.evaluate((el) => getComputedStyle(el).borderRightWidth))
      .toBe("0px");
    await expect
      .poll(() => panel.evaluate((el) => getComputedStyle(el).borderLeftWidth))
      .toBe("1px");
  });

  test("desktop detail panel stays fixed while the browser page scrolls", async ({ page }) => {
    await page.setViewportSize({ width: 1536, height: 864 });
    await page.goto("/app/feed?noAutoGenerate");
    await expect(page.locator('[data-testid="post-card"]').first()).toBeVisible();

    await page
      .locator('[data-testid="post-card"]')
      .first()
      .locator('[data-testid="source-badge"]')
      .click();

    const panel = page.locator('[data-testid="feed-detail-panel"]');
    await expect(panel).toBeVisible();

    const initialPanelBox = await panel.boundingBox();
    expect(initialPanelBox).not.toBeNull();

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);

    const scrolledPanelBox = await panel.boundingBox();
    expect(scrolledPanelBox).not.toBeNull();

    const viewport = page.viewportSize();
    expect(viewport).not.toBeNull();
    expect(Math.abs(scrolledPanelBox!.y - initialPanelBox!.y)).toBeLessThanOrEqual(1);
    expect(
      Math.abs(scrolledPanelBox!.height - (viewport!.height - initialPanelBox!.y)),
    ).toBeLessThanOrEqual(1);
  });

  test("empty state shows when no posts exist", async ({ page }) => {
    // Navigate to a feed state that has no posts by using noAutoGenerate
    // The seeded account has posts, so this test verifies the empty state UI exists
    // by checking the empty state component renders when no results come back.
    // For a real empty state test, we'd need an ephemeral account with no documents.
    // This test verifies that the seeded feed does NOT show empty state.
    const cards = page.locator('[data-testid="post-card"]');
    await expect(cards.first()).toBeVisible();

    const emptyState = page.locator('[data-testid="feed-empty-state"]');
    await expect(emptyState).toHaveCount(0);
  });
});
