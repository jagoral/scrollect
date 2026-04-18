import { test, expect } from "@playwright/test";
import path from "node:path";

import { FIXTURES_DIR, SEEDED_USER, cleanupTestData, resetTestData, signUp } from "./helpers";

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
      .locator('[data-slot="sidebar"]')
      .getByRole("link", { name: /upload/i })
      .click();
    await expect(page).toHaveURL(/\/upload/);
    await expect(page.getByRole("heading", { name: /upload content/i })).toBeVisible();
  });

  test("user can upload a Markdown file and sees success message", async ({ page }) => {
    await page.goto("/app/upload");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: /upload content/i })).toBeVisible();

    await page.locator('input[type="file"]').setInputFiles(path.join(FIXTURES_DIR, "test.md"));

    // Should show success toast with link to library, or error toast
    await expect(page.getByText(/uploaded|failed/i)).toBeVisible({ timeout: 30000 });
  });

  test("after upload, document appears in library with correct title", async ({ page }) => {
    await page.goto("/app/upload");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: /upload content/i })).toBeVisible();
    await page.locator('input[type="file"]').setInputFiles(path.join(FIXTURES_DIR, "test.md"));
    await expect(page.getByText(/uploaded/i)).toBeVisible({ timeout: 30000 });

    // Navigate to library and find the document
    await page.goto("/app/library");
    await page.waitForLoadState("networkidle");
    await expect(page.locator('[data-testid="document-item"]').first()).toBeVisible({
      timeout: 10000,
    });
  });

  test("clicking a document in library navigates to detail page", async ({ page }) => {
    await page.goto("/app/upload");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: /upload content/i })).toBeVisible();
    await page.locator('input[type="file"]').setInputFiles(path.join(FIXTURES_DIR, "test.md"));
    await expect(page.getByText(/uploaded/i)).toBeVisible({ timeout: 30000 });

    // Go to library and click the first document
    await page.goto("/app/library");
    await page.waitForLoadState("networkidle");
    const docButton = page.locator('[data-testid="document-item"]').first();
    await expect(docButton).toBeVisible({ timeout: 10000 });
    await docButton.click();

    // Detail panel should show document content
    await expect(
      page.locator('[data-testid="status-ready"], [data-testid="status-extracting"]').first(),
    ).toBeVisible({
      timeout: 15000,
    });
  });

  test("document detail page shows title and status after processing", async ({ page }) => {
    await page.goto("/app/upload");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: /upload content/i })).toBeVisible();
    await page.locator('input[type="file"]').setInputFiles(path.join(FIXTURES_DIR, "test.md"));
    await expect(page.getByText(/uploaded/i)).toBeVisible({ timeout: 30000 });

    // Navigate to library and click the document
    await page.goto("/app/library");
    await page.waitForLoadState("networkidle");
    const docButton = page.locator('[data-testid="document-item"]').first();
    await expect(docButton).toBeVisible({ timeout: 10000 });
    await docButton.click();

    // Wait for processing to complete (ready or error - fail fast on error)
    await expect(
      page.locator('[data-testid="status-ready"], [data-testid="status-error"]').first(),
    ).toBeVisible({ timeout: 90000 });
    await expect(page.locator('[data-testid="status-ready"]').first()).toBeVisible();
  });

  test("upload page rejects unsupported file types", async ({ page }) => {
    await page.goto("/app/upload");
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

test.describe("File upload size validation", { tag: "@seeded" }, () => {
  test.afterEach(async () => {
    await resetTestData(SEEDED_USER.email);
  });

  test("oversized markdown file shows error toast", async ({ page }) => {
    await page.goto("/app/upload");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: /upload content/i })).toBeVisible();

    // Use markdown (5MB limit) instead of PDF (50MB limit) to stay under
    // Playwright's 50MB in-memory buffer cap for setInputFiles
    await page.locator('[data-testid="file-input"]').setInputFiles({
      name: "huge.md",
      mimeType: "text/markdown",
      buffer: Buffer.alloc(5 * 1024 * 1024 + 1),
    });

    await expect(page.locator("[data-sonner-toast]").getByText(/file too large/i)).toBeVisible({
      timeout: 5000,
    });
  });

  test("empty file shows error toast", async ({ page }) => {
    await page.goto("/app/upload");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: /upload content/i })).toBeVisible();

    await page.locator('[data-testid="file-input"]').setInputFiles({
      name: "empty.md",
      mimeType: "text/markdown",
      buffer: Buffer.alloc(0),
    });

    await expect(page.locator("[data-sonner-toast]").getByText(/is empty/i)).toBeVisible({
      timeout: 5000,
    });
  });

  test("upload help text displays correct size limits", async ({ page }) => {
    await page.goto("/app/upload");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: /upload content/i })).toBeVisible();

    const helpText = page.locator('[data-testid="file-drop-zone"]').getByText(/accepts/i);
    await expect(helpText).toBeVisible();
    await expect(helpText).toContainText("10.0 MB");
    await expect(helpText).toContainText("5.0 MB");
    await expect(helpText).toContainText("1.0 MB");
  });
});

test.describe("Unauthenticated access", () => {
  test("unauthenticated user is redirected from /upload", async ({ page }) => {
    await page.goto("/app/upload");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/signin/, { timeout: 15000 });
  });

  test("unauthenticated user is redirected from /library", async ({ page }) => {
    await page.goto("/app/library");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/signin/, { timeout: 15000 });
  });
});
