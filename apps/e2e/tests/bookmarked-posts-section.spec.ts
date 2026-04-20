import { test, expect, type Page } from "@playwright/test";

import { SEEDED_USER, goToFirstDocument, resetTestData, signInToSeededFeed } from "./helpers";

async function bookmarkFirstPostAndNavigateToDocument(page: Page) {
  await signInToSeededFeed(page);

  const firstPost = page.locator('[data-testid="post-card"]').first();
  const saveButton = firstPost.locator('[data-testid="save-button"]');
  await saveButton.click();
  await expect(saveButton).toHaveAttribute("aria-pressed", "true", { timeout: 15000 });

  // Click the source badge (not the whole post) — quiz posts have answer
  // buttons that stopPropagation, so Playwright's center-click doesn't
  // reliably reach the article's onClick.
  await firstPost.locator('[data-testid="source-badge"]').click();

  const detailPanel = page.locator('[data-testid="feed-detail-panel"]');
  await expect(detailPanel).toBeVisible({ timeout: 10000 });
  const libraryLink = detailPanel.getByRole("link", { name: /^library$/i });
  await expect(libraryLink).toBeVisible({ timeout: 10000 });
  await libraryLink.click();

  await expect(page).toHaveURL(/\/app\/library\/.+/, { timeout: 15000 });
  await expect(page.locator('[data-testid="status-ready"]').first()).toBeVisible({
    timeout: 15000,
  });
}

test.describe("Bookmarked posts section on document detail page", { tag: "@seeded" }, () => {
  test.setTimeout(60000);

  test.afterEach(async () => {
    await resetTestData(SEEDED_USER.email);
  });

  test("section is hidden when document has no bookmarked posts", async ({ page }) => {
    await goToFirstDocument(page);
    // Wait for the document detail panel to fully load its Convex queries
    // by confirming a section that always renders for ready documents
    await expect(page.locator('[data-testid="status-ready"]').first()).toBeVisible({
      timeout: 15000,
    });
    await expect(page.locator('[data-testid="bookmarked-posts-section"]')).toHaveCount(0);
  });

  test("section appears with correct count after bookmarking a post", async ({ page }) => {
    await bookmarkFirstPostAndNavigateToDocument(page);

    const section = page.locator('[data-testid="bookmarked-posts-section"]');
    await expect(section).toBeVisible({ timeout: 15000 });
    await expect(section).toContainText("Bookmarked posts (1)");
  });

  test("collapsible expands to show posts and collapses to hide them", async ({ page }) => {
    await bookmarkFirstPostAndNavigateToDocument(page);

    const section = page.locator('[data-testid="bookmarked-posts-section"]');
    await expect(section).toBeVisible({ timeout: 15000 });

    const postList = page.locator('[data-testid="bookmarked-posts-list"]');
    await expect(postList).not.toBeVisible();

    const trigger = section.getByRole("button", { name: /bookmarked posts/i });
    await trigger.click();

    await expect(postList).toBeVisible({ timeout: 5000 });
    const posts = postList.locator('[data-testid="post-card"]');
    await expect(posts).toHaveCount(1);

    await trigger.click();
    await expect(postList).not.toBeVisible({ timeout: 5000 });
  });

  test("unbookmarking the last post hides the section", async ({ page }) => {
    await bookmarkFirstPostAndNavigateToDocument(page);

    const section = page.locator('[data-testid="bookmarked-posts-section"]');
    await expect(section).toBeVisible({ timeout: 15000 });

    const trigger = section.getByRole("button", { name: /bookmarked posts/i });
    await trigger.click();

    const postList = page.locator('[data-testid="bookmarked-posts-list"]');
    await expect(postList).toBeVisible({ timeout: 5000 });

    const savedPost = postList.locator('[data-testid="post-card"]').first();
    const postSaveButton = savedPost.locator('[data-testid="save-button"]');
    await postSaveButton.click();

    await expect(section).not.toBeVisible({ timeout: 15000 });
  });
});
