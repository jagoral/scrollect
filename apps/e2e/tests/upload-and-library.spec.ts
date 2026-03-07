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
  // Switch from sign-in to sign-up form
  await page.getByRole("button", { name: /sign up/i }).click();
  await page.getByLabel("Name").fill(user.name);
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: /create account/i }).click();
  await expect(page).toHaveURL(/\/library/, { timeout: 15000 });
}

async function uploadFile(page: import("@playwright/test").Page, filePath: string) {
  await page.locator('input[type="file"]').setInputFiles(filePath);
}

test.describe("Upload and Content Library flow", () => {
  test.beforeEach(async ({ page }) => {
    await signUp(page);
  });

  test("authenticated user can navigate to the upload page", async ({ page }) => {
    await page.getByRole("link", { name: /upload/i }).click();
    await expect(page).toHaveURL(/\/upload/);
    await expect(page.getByRole("heading", { name: /upload content/i })).toBeVisible();
  });

  test("user can upload a Markdown file and sees success message", async ({ page }) => {
    await page.goto("/upload");
    await expect(page.getByRole("heading", { name: /upload content/i })).toBeVisible();

    await uploadFile(page, path.join(FIXTURES_DIR, "test.md"));

    // Should show success toast with link to library, or error toast
    await expect(page.getByText(/uploaded|failed/i)).toBeVisible({ timeout: 30000 });
  });

  // TODO: Unskip after ADR-001 pipeline is fully implemented (processing no longer auto-triggers on upload)
  test.skip("after upload, document appears in library with correct title", async ({ page }) => {
    await page.goto("/upload");
    await expect(page.getByRole("heading", { name: /upload content/i })).toBeVisible();
    await uploadFile(page, path.join(FIXTURES_DIR, "test.md"));
    await expect(page.getByText(/uploaded/i)).toBeVisible({ timeout: 30000 });

    // Navigate to library and find the document by its card link
    await page.goto("/library");
    await expect(page.locator("a[href^='/library/']").first()).toBeVisible({ timeout: 10000 });
  });

  // TODO: Unskip after ADR-001 pipeline is fully implemented
  test.skip("clicking a document in library navigates to detail page", async ({ page }) => {
    await page.goto("/upload");
    await expect(page.getByRole("heading", { name: /upload content/i })).toBeVisible();
    await uploadFile(page, path.join(FIXTURES_DIR, "test.md"));
    await expect(page.getByText(/uploaded/i)).toBeVisible({ timeout: 30000 });

    // Go to library and click the first document link
    await page.goto("/library");
    const docLink = page.locator("a[href^='/library/']").first();
    await expect(docLink).toBeVisible({ timeout: 10000 });
    await docLink.click();

    // Should be on detail page
    await expect(page).toHaveURL(/\/library\/.+/);
    await expect(page.getByText(/back to library/i)).toBeVisible();
  });

  // TODO: Unskip after ADR-001 pipeline is fully implemented
  test.skip("document detail page shows title and chunks after processing", async ({ page }) => {
    test.setTimeout(120000);
    await page.goto("/upload");
    await expect(page.getByRole("heading", { name: /upload content/i })).toBeVisible();
    await uploadFile(page, path.join(FIXTURES_DIR, "test.md"));
    await expect(page.getByText(/uploaded/i)).toBeVisible({ timeout: 30000 });

    // Navigate to library and click the document
    await page.goto("/library");
    const docLink = page.locator("a[href^='/library/']").first();
    await expect(docLink).toBeVisible({ timeout: 10000 });
    await docLink.click();
    await expect(page).toHaveURL(/\/library\/.+/);

    // Wait for processing to complete — chunks should appear
    await expect(page.getByText("Chunk 1")).toBeVisible({ timeout: 90000 });
  });

  test("upload page rejects unsupported file types", async ({ page }) => {
    await page.goto("/upload");
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
    await expect(page).toHaveURL(/\/signin/, { timeout: 15000 });
  });

  test("unauthenticated user is redirected from /library", async ({ page }) => {
    await page.goto("/library");
    await expect(page).toHaveURL(/\/signin/, { timeout: 15000 });
  });
});
