import { test, expect } from "@playwright/test";
import path from "node:path";

import { FIXTURES_DIR, cleanupTestData, signUp } from "./helpers";

test.describe("EPUB file upload", () => {
  test.setTimeout(120000);

  let ephemeralEmail: string;

  test.beforeEach(async ({ page }) => {
    const { email } = await signUp(page);
    ephemeralEmail = email;
  });

  test.afterEach(async () => {
    await cleanupTestData(ephemeralEmail);
  });

  test("user can upload an EPUB file and sees success message", async ({ page }) => {
    await page.goto("/app/upload");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: /upload content/i })).toBeVisible();

    await page
      .locator('[data-testid="file-input"]')
      .setInputFiles(path.join(FIXTURES_DIR, "test.epub"));

    await expect(page.getByText(/uploaded|failed/i)).toBeVisible({ timeout: 30000 });
  });

  test("EPUB document reaches ready status and produces chunks", async ({ page }) => {
    await page.goto("/app/upload");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: /upload content/i })).toBeVisible();

    await page
      .locator('[data-testid="file-input"]')
      .setInputFiles(path.join(FIXTURES_DIR, "test.epub"));

    await expect(page.getByText(/uploaded/i)).toBeVisible({ timeout: 30000 });

    await page.goto("/app/library");
    await page.waitForLoadState("networkidle");
    const docButton = page.locator('[data-testid="document-item"]').first();
    await expect(docButton).toBeVisible({ timeout: 10000 });
    await docButton.click();

    await expect(page.getByText(/chunk/i)).toBeVisible({ timeout: 90000 });
  });

  test("upload page help text mentions epub", async ({ page }) => {
    await page.goto("/app/upload");
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(/\.epub/)).toBeVisible();
  });
});
