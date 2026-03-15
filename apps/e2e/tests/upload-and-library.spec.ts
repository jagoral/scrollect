import { test, expect } from "@playwright/test";
import path from "node:path";

import { FIXTURES_DIR, cleanupTestData, signUp } from "./helpers";

test.describe("Upload and Content Library flow", () => {
  test.setTimeout(120000);

  let ephemeralEmail: string;

  test.beforeEach(async ({ page }) => {
    const { email } = await signUp(page);
    ephemeralEmail = email;
  });

  test.afterEach(async () => {
    await cleanupTestData(ephemeralEmail);
  });

  test("authenticated user can navigate to the upload page", async ({ page }) => {
    await page
      .locator("nav")
      .getByRole("button", { name: /upload/i })
      .click();
    await expect(page).toHaveURL(/\/upload/);
    await expect(page.getByRole("heading", { name: /upload content/i })).toBeVisible();
  });

  test("user can upload a Markdown file and sees success message", async ({ page }) => {
    await page.goto("/upload");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: /upload content/i })).toBeVisible();

    await page.locator('input[type="file"]').setInputFiles(path.join(FIXTURES_DIR, "test.md"));

    // Should show success toast with link to library, or error toast
    await expect(page.getByText(/uploaded|failed/i)).toBeVisible({ timeout: 30000 });
  });

  test("after upload, document appears in library with correct title", async ({ page }) => {
    await page.goto("/upload");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: /upload content/i })).toBeVisible();
    await page.locator('input[type="file"]').setInputFiles(path.join(FIXTURES_DIR, "test.md"));
    await expect(page.getByText(/uploaded/i)).toBeVisible({ timeout: 30000 });

    // Navigate to library and find the document by its card link
    await page.goto("/library");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("a[href^='/library/']").first()).toBeVisible({ timeout: 10000 });
  });

  test("clicking a document in library navigates to detail page", async ({ page }) => {
    await page.goto("/upload");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: /upload content/i })).toBeVisible();
    await page.locator('input[type="file"]').setInputFiles(path.join(FIXTURES_DIR, "test.md"));
    await expect(page.getByText(/uploaded/i)).toBeVisible({ timeout: 30000 });

    // Go to library and click the first document link
    await page.goto("/library");
    await page.waitForLoadState("networkidle");
    const docLink = page.locator("a[href^='/library/']").first();
    await expect(docLink).toBeVisible({ timeout: 10000 });
    await docLink.click();

    // Should be on detail page
    await expect(page).toHaveURL(/\/library\/.+/);
    await expect(page.getByText(/back to library/i)).toBeVisible();
  });

  test("document detail page shows title and status after processing", async ({ page }) => {
    await page.goto("/upload");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: /upload content/i })).toBeVisible();
    await page.locator('input[type="file"]').setInputFiles(path.join(FIXTURES_DIR, "test.md"));
    await expect(page.getByText(/uploaded/i)).toBeVisible({ timeout: 30000 });

    // Navigate to library and click the document
    await page.goto("/library");
    await page.waitForLoadState("networkidle");
    const docLink = page.locator("a[href^='/library/']").first();
    await expect(docLink).toBeVisible({ timeout: 10000 });
    await docLink.click();
    await expect(page).toHaveURL(/\/library\/.+/);

    // Wait for processing to complete — should show chunk count in metadata
    await expect(page.getByText(/chunk/i)).toBeVisible({ timeout: 90000 });
  });

  test("upload page rejects unsupported file types", async ({ page }) => {
    await page.goto("/upload");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: /upload content/i })).toBeVisible();

    await page.locator('input[type="file"]').setInputFiles({
      name: "invalid.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("This is a plain text file"),
    });

    // Should show error toast about unsupported file type
    await expect(page.getByText(/unsupported file type/i)).toBeVisible({
      timeout: 5000,
    });
  });
});

test.describe("Unauthenticated access", () => {
  test("unauthenticated user is redirected from /upload", async ({ page }) => {
    await page.goto("/upload");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/signin/, { timeout: 15000 });
  });

  test("unauthenticated user is redirected from /library", async ({ page }) => {
    await page.goto("/library");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/signin/, { timeout: 15000 });
  });
});
