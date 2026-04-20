import { test, expect } from "@playwright/test";

import { SEEDED_USER, resetTestData, signInToSeededFeed } from "./helpers";

const CARD = '[data-testid="post-card"]';
const NEW_BADGE = '[data-testid="new-badge"]';
const UNREAD_BANNER = '[data-testid="feed-new-posts-banner"]';

test.describe("Unread generated posts on feed", { tag: "@seeded" }, () => {
  test.setTimeout(60000);

  test.beforeEach(async ({ page }) => {
    await signInToSeededFeed(page);
  });

  test.afterEach(async () => {
    await resetTestData(SEEDED_USER.email);
  });

  test("new batch affordance jumps to unread posts and clears after viewing", async ({ page }) => {
    const cards = page.locator(CARD);
    await expect(cards.first()).toBeVisible({ timeout: 15000 });
    const totalCards = await cards.count();
    expect(totalCards).toBeGreaterThan(1);

    const unreadCard = cards.nth(totalCards - 1);
    const unreadPostId = await unreadCard.getAttribute("data-post-id");
    expect(unreadPostId).toBeTruthy();

    await page.evaluate((postId) => {
      window.scrollTo(0, 0);
      window.localStorage.setItem(
        "scrollect.feed.unreadPostBatches.v1",
        JSON.stringify({
          all: {
            postIds: [postId],
            createdAt: Date.now(),
          },
        }),
      );
    }, unreadPostId);

    await page.reload();

    await expect(page.locator(UNREAD_BANNER)).toBeVisible({ timeout: 15000 });
    await expect(page.locator(UNREAD_BANNER)).toContainText("1 new post");
    await expect(page.locator(NEW_BADGE)).toHaveCount(1);

    await page.locator('[data-testid="feed-jump-to-new-posts"]').click();
    await expect(page.locator(UNREAD_BANNER)).toBeHidden({ timeout: 5000 });
    await expect(page.locator(NEW_BADGE)).toHaveCount(0);
  });
});
