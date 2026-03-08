import { test, expect } from "@playwright/test";
import path from "node:path";

const FIXTURES_DIR = path.join(__dirname, "..", "fixtures");

function testUser() {
  return {
    name: "E2E Tester",
    email: `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.scrollect.dev`,
    password: "testpassword123",
  };
}

async function signUp(page: import("@playwright/test").Page) {
  const user = testUser();
  await page.goto("/signin");
  await page.getByRole("button", { name: /sign up/i }).click();
  await page.getByLabel("Name").fill(user.name);
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: /create account/i }).click();
  await expect(page).toHaveURL(/\/library/, { timeout: 15000 });
}

async function cleanupTestData(page: import("@playwright/test").Page) {
  try {
    const response = await page.request.post("/api/e2e-cleanup");
    if (!response.ok()) {
      console.warn(`E2E cleanup failed: ${response.status()} ${await response.text()}`);
    }
  } catch (error) {
    console.warn("E2E cleanup error:", error);
  }
}

async function uploadAndWaitForProcessing(page: import("@playwright/test").Page) {
  await page.goto("/upload");
  await expect(page.getByRole("heading", { name: /upload content/i })).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles(path.join(FIXTURES_DIR, "test.md"));
  await expect(page.getByText(/uploaded/i)).toBeVisible({ timeout: 30000 });

  // Navigate to library and wait for the document to appear and be processed
  await page.goto("/library");
  await expect(page.locator("a[href^='/library/']").first()).toBeVisible({ timeout: 30000 });

  // Click into the document and wait for processing to complete (chunks visible)
  const docLink = page.locator("a[href^='/library/']").first();
  await docLink.click();
  await expect(page).toHaveURL(/\/library\/.+/);
  await expect(page.getByText(/chunk/i).first()).toBeVisible({ timeout: 90000 });
}

async function navigateToFeedAndGenerate(page: import("@playwright/test").Page) {
  await page.goto("/feed");
  await expect(page.getByRole("heading", { name: /feed/i })).toBeVisible({ timeout: 15000 });

  // Click "Generate" button to create posts
  const generateButton = page.getByRole("button", { name: /generate/i }).first();
  await expect(generateButton).toBeVisible();
  await generateButton.click();

  // Wait for post cards to appear (AI generation can take a while)
  await expect(page.locator('[data-testid="post-card"]').first()).toBeVisible({ timeout: 120000 });
}

test.describe("Feed interactions and pagination", () => {
  test.setTimeout(180000);

  test.beforeEach(async ({ page }) => {
    await signUp(page);
    await uploadAndWaitForProcessing(page);
    await navigateToFeedAndGenerate(page);
  });

  test.afterEach(async ({ page }) => {
    await cleanupTestData(page);
  });

  test("should display feed cards with interaction buttons", async ({ page }) => {
    const firstCard = page.locator('[data-testid="post-card"]').first();
    await expect(firstCard).toBeVisible();

    // Each card should have save, like, and dislike buttons
    await expect(firstCard.locator('[data-testid="save-button"]')).toBeVisible();
    await expect(firstCard.locator('[data-testid="like-button"]')).toBeVisible();
    await expect(firstCard.locator('[data-testid="dislike-button"]')).toBeVisible();
  });

  test("should toggle like on a card", async ({ page }) => {
    const firstCard = page.locator('[data-testid="post-card"]').first();
    const likeButton = firstCard.locator('[data-testid="like-button"]');

    // Click like
    await likeButton.click();

    // Verify active state: ThumbsUp icon should have fill-current and text-green-600
    await expect(likeButton.locator("svg.fill-current.text-green-600")).toBeVisible({
      timeout: 5000,
    });

    // Click like again to toggle off
    await likeButton.click();

    // Verify inactive state: no fill-current on the SVG
    await expect(likeButton.locator("svg.fill-current.text-green-600")).not.toBeVisible({
      timeout: 5000,
    });
  });

  test("should toggle dislike on a card", async ({ page }) => {
    const firstCard = page.locator('[data-testid="post-card"]').first();
    const dislikeButton = firstCard.locator('[data-testid="dislike-button"]');

    // Click dislike
    await dislikeButton.click();

    // Verify active state: ThumbsDown icon should have fill-current and text-red-500
    await expect(dislikeButton.locator("svg.fill-current.text-red-500")).toBeVisible({
      timeout: 5000,
    });

    // Click dislike again to toggle off
    await dislikeButton.click();

    // Verify inactive state
    await expect(dislikeButton.locator("svg.fill-current.text-red-500")).not.toBeVisible({
      timeout: 5000,
    });
  });

  test("should make like and dislike mutually exclusive", async ({ page }) => {
    const firstCard = page.locator('[data-testid="post-card"]').first();
    const likeButton = firstCard.locator('[data-testid="like-button"]');
    const dislikeButton = firstCard.locator('[data-testid="dislike-button"]');

    // Click like first
    await likeButton.click();
    await expect(likeButton.locator("svg.fill-current.text-green-600")).toBeVisible({
      timeout: 5000,
    });

    // Now click dislike
    await dislikeButton.click();

    // Like should be inactive, dislike should be active
    await expect(dislikeButton.locator("svg.fill-current.text-red-500")).toBeVisible({
      timeout: 5000,
    });
    await expect(likeButton.locator("svg.fill-current.text-green-600")).not.toBeVisible({
      timeout: 5000,
    });
  });

  test("should toggle save (bookmark) on a card", async ({ page }) => {
    const firstCard = page.locator('[data-testid="post-card"]').first();
    const saveButton = firstCard.locator('[data-testid="save-button"]');

    // Click save
    await saveButton.click();

    // Verify active state: BookmarkCheck icon should have text-primary class
    await expect(saveButton.locator("svg.text-primary")).toBeVisible({ timeout: 5000 });

    // Click save again to toggle off
    await saveButton.click();

    // Verify inactive state
    await expect(saveButton.locator("svg.text-primary")).not.toBeVisible({ timeout: 5000 });
  });

  test("should show saved post on Saved page", async ({ page }) => {
    const firstCard = page.locator('[data-testid="post-card"]').first();
    const saveButton = firstCard.locator('[data-testid="save-button"]');

    // Save the first card
    await saveButton.click();
    await expect(saveButton.locator("svg.text-primary")).toBeVisible({ timeout: 5000 });

    // Navigate to /saved
    await page.goto("/saved");
    await expect(page.getByRole("heading", { name: /saved/i })).toBeVisible({ timeout: 15000 });

    // Verify at least one post card appears on the saved page
    await expect(page.locator('[data-testid="post-card"]').first()).toBeVisible({ timeout: 15000 });
  });

  test("should show 'all caught up' at bottom of feed", async ({ page }) => {
    // Scroll to the bottom repeatedly to load all posts
    let previousCardCount = 0;
    for (let i = 0; i < 20; i++) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(1000);

      const currentCardCount = await page.locator('[data-testid="post-card"]').count();
      const endState = page.locator('[data-testid="feed-end-state"]');
      if (await endState.isVisible()) {
        break;
      }

      // If no new cards loaded, scroll again
      if (currentCardCount === previousCardCount && i > 2) {
        // Give one more attempt then break
        await page.waitForTimeout(2000);
        break;
      }
      previousCardCount = currentCardCount;
    }

    // Verify the end state is visible
    const endState = page.locator('[data-testid="feed-end-state"]');
    await expect(endState).toBeVisible({ timeout: 10000 });
    await expect(endState).toContainText("all caught up");
  });
});
