import { test, expect } from "@playwright/test";
import path from "node:path";

import { FIXTURES_DIR, cleanupTestData, fetchConnectionDrafts, signUp } from "./helpers";

async function uploadMarkdownFile(page: import("@playwright/test").Page, filename: string) {
  await page.goto("/app/upload");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { name: /upload content/i })).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles(path.join(FIXTURES_DIR, filename));
  await expect(page.getByText(/uploaded/i)).toBeVisible({ timeout: 30000 });
}

async function waitForLatestDocumentReady(page: import("@playwright/test").Page) {
  await page.goto("/app/library");
  await page.waitForLoadState("networkidle");
  const docLink = page.locator("a[href^='/app/library/']").first();
  await expect(docLink).toBeVisible({ timeout: 15000 });
  await docLink.click();
  await expect(page).toHaveURL(/\/app\/library\/.+/);

  await expect(
    page.locator('[data-testid="status-ready"], [data-testid="status-error"]').first(),
  ).toBeVisible({ timeout: 90000 });

  if (await page.locator('[data-testid="status-error"]').isVisible()) {
    const retryButton = page.locator('[data-testid="retry-processing-button"]');
    if (await retryButton.isVisible()) {
      await retryButton.click();
      await expect(page.locator('[data-testid="status-ready"]')).toBeVisible({ timeout: 90000 });
      return;
    }
  }

  await expect(page.locator('[data-testid="status-ready"]')).toBeVisible();
}

async function pollConnectionDrafts(
  email: string,
  { timeout = 60000, interval = 2000 }: { timeout?: number; interval?: number } = {},
) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const drafts = await fetchConnectionDrafts(email);
    if (drafts.length > 0) return drafts;
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  return [];
}

test.describe("Connection discovery pipeline", () => {
  test.setTimeout(180000);

  let ephemeralEmail: string;

  test.beforeEach(async ({ page }) => {
    const { email } = await signUp(page);
    ephemeralEmail = email;
  });

  test.afterEach(async () => {
    await cleanupTestData(ephemeralEmail);
  });

  test("uploading two related documents produces connection card drafts", async ({ page }) => {
    await uploadMarkdownFile(page, "connection-doc-a.md");
    await waitForLatestDocumentReady(page);

    await uploadMarkdownFile(page, "connection-doc-b.md");
    await waitForLatestDocumentReady(page);

    const drafts = await pollConnectionDrafts(ephemeralEmail);
    expect(drafts.length).toBeGreaterThan(0);

    for (const draft of drafts) {
      expect(draft.strategy).toBe("connection");
      expect(draft.cardType).toBe("connection");
      expect(draft.typeData.type).toBe("connection");
      expect(draft.sourceChunkIds.length).toBeGreaterThanOrEqual(2);
      expect(draft.content.length).toBeGreaterThan(0);
    }
  });

  test("document reaches ready status regardless of connection discovery outcome", async ({
    page,
  }) => {
    await uploadMarkdownFile(page, "connection-doc-a.md");
    await waitForLatestDocumentReady(page);
    await expect(page.getByText(/back to library/i)).toBeVisible();
  });
});
