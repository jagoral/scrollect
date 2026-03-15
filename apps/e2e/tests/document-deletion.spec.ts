import { test, expect } from "@playwright/test";
import path from "node:path";

import { FIXTURES_DIR, cleanupTestData, signUp } from "./helpers";

test.describe("Document deletion", () => {
  test.setTimeout(120000);

  let ephemeralEmail: string;

  test.beforeEach(async ({ page }) => {
    const { email } = await signUp(page);
    ephemeralEmail = email;
  });

  test.afterEach(async () => {
    await cleanupTestData(ephemeralEmail);
  });

  test("user can delete a document and it no longer appears in library", async ({ page }) => {
    await page.goto("/upload");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: /upload content/i })).toBeVisible();

    await page.locator('input[type="file"]').setInputFiles(path.join(FIXTURES_DIR, "test.md"));
    await expect(page.getByText(/uploaded/i)).toBeVisible({ timeout: 30000 });

    await page.goto("/library");
    await page.waitForLoadState("networkidle");
    const docLink = page.locator("a[href^='/library/']").first();
    await expect(docLink).toBeVisible({ timeout: 10000 });

    const docTitle = await docLink.textContent();
    await docLink.click();

    await expect(page).toHaveURL(/\/library\/.+/);
    await expect(page.getByText(/back to library/i)).toBeVisible({
      timeout: 10000,
    });

    await page.getByRole("button", { name: /delete document/i }).click();

    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible({ timeout: 5000 });

    await dialog.getByRole("button", { name: /^delete$/i }).click();

    await expect(page).toHaveURL(/\/library\/?$/, { timeout: 30000 });
    await page.waitForLoadState("networkidle");

    const remainingLinks = page.locator("a[href^='/library/']");
    const linkCount = await remainingLinks.count();

    if (linkCount > 0 && docTitle) {
      for (let i = 0; i < linkCount; i++) {
        const text = await remainingLinks.nth(i).textContent();
        expect(text).not.toBe(docTitle);
      }
    }
  });
});
