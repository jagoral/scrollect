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
    await page.goto("/app/upload");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: /upload content/i })).toBeVisible();

    await page.locator('input[type="file"]').setInputFiles(path.join(FIXTURES_DIR, "test.md"));
    await expect(page.getByText(/uploaded/i)).toBeVisible({ timeout: 30000 });

    await page.goto("/app/library");
    await page.waitForLoadState("networkidle");
    const docButton = page.locator('[data-testid="document-item"]').first();
    await expect(docButton).toBeVisible({ timeout: 10000 });

    await docButton.click();

    // Wait for detail panel to load
    await expect(page.locator('[data-testid="delete-document-button"]')).toBeVisible({
      timeout: 15000,
    });

    await page.locator('[data-testid="delete-document-button"]').click();

    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible({ timeout: 5000 });

    await dialog.getByRole("button", { name: /^delete$/i }).click();

    // After deletion, the document should no longer be in the library list
    await expect(page.locator('[data-testid="document-item"]')).toHaveCount(0, { timeout: 30000 });
  });
});
