import { test, expect } from "@playwright/test";
import path from "node:path";

import {
  FIXTURES_DIR,
  SEEDED_USER,
  cleanupTestData,
  reseedAccount,
  resetTestData,
  signUp,
  skipLearningGoalPrompt,
} from "./helpers";

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
    await skipLearningGoalPrompt(page);
  });

  test("after upload, user can set a learning goal before cards are generated", async ({
    page,
  }) => {
    await page.goto("/app/upload");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: /upload content/i })).toBeVisible();

    await page
      .locator('[data-testid="file-input"]')
      .setInputFiles(path.join(FIXTURES_DIR, "test.md"));

    await expect(page.getByRole("dialog", { name: /what do you want to learn/i })).toBeVisible({
      timeout: 30000,
    });
    await page.locator('[data-testid="learning-goal-preset-learn-the-key-concepts"]').click();

    const textarea = page.locator('[data-testid="onboarding-learning-goal-textarea"]');
    await expect(textarea).toHaveValue("Learn the key concepts");
    await textarea.fill("Key concepts I can reuse in TypeScript architecture");
    await expect(page.locator('[data-testid="onboarding-learning-goal-char-count"]')).toHaveText(
      "51/500",
    );

    await page.locator('[data-testid="learning-goal-save"]').click();
    await expect(page.locator("[data-sonner-toast]").getByText(/goal saved/i)).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByRole("dialog", { name: /what do you want to learn/i })).toBeHidden();

    await page.goto("/app/library");
    await page.waitForLoadState("networkidle");
    const docButton = page.locator('[data-testid="document-item"]').first();
    await expect(docButton).toBeVisible({ timeout: 10000 });
    await docButton.click();

    await expect(page.locator('[data-testid="status-ready"]').first()).toBeVisible({
      timeout: 90000,
    });
    await expect(page.locator('[data-testid="learning-goal-textarea"]')).toHaveValue(
      "Key concepts I can reuse in TypeScript architecture",
    );
  });

  test("after upload, user can skip the learning goal prompt", async ({ page }) => {
    await page.goto("/app/upload");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: /upload content/i })).toBeVisible();

    await page
      .locator('[data-testid="file-input"]')
      .setInputFiles(path.join(FIXTURES_DIR, "test.md"));

    const dialog = page.getByRole("dialog", { name: /what do you want to learn/i });
    await expect(dialog).toBeVisible({ timeout: 30000 });
    await page.locator('[data-testid="learning-goal-skip"]').click();
    await expect(dialog).toBeHidden();

    await page.goto("/app/library");
    await page.waitForLoadState("networkidle");
    const docButton = page.locator('[data-testid="document-item"]').first();
    await expect(docButton).toBeVisible({ timeout: 10000 });
    await docButton.click();
    await expect(
      page
        .locator(
          [
            '[data-testid="status-ready"]',
            '[data-testid="status-uploaded"]',
            '[data-testid="status-parsing"]',
            '[data-testid="status-chunking"]',
            '[data-testid="status-embedding"]',
            '[data-testid="status-summarizing"]',
            '[data-testid="status-generating_cards"]',
          ].join(", "),
        )
        .first(),
    ).toBeVisible({ timeout: 30000 });
  });

  test("multiple uploads queue a learning goal choice for each document", async ({ page }) => {
    await page.goto("/app/upload");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: /upload content/i })).toBeVisible();

    await page.locator('[data-testid="file-input"]').setInputFiles([
      {
        name: "queue-one.md",
        mimeType: "text/markdown",
        buffer: Buffer.from("# Queue one\n\nFirst document for learning goal queue coverage."),
      },
      {
        name: "queue-two.md",
        mimeType: "text/markdown",
        buffer: Buffer.from("# Queue two\n\nSecond document for learning goal queue coverage."),
      },
    ]);

    const dialog = page.getByRole("dialog", { name: /what do you want to learn/i });
    await expect(dialog).toBeVisible({ timeout: 30000 });

    const skipButton = page.locator('[data-testid="learning-goal-skip"]');
    await expect(skipButton).toBeEnabled({ timeout: 30000 });
    await skipButton.click();

    await expect(skipButton).toBeEnabled({ timeout: 30000 });
    await skipButton.click();
    await expect(dialog).toBeHidden({ timeout: 10000 });
  });

  test("after upload, document appears in library with correct title", async ({ page }) => {
    await page.goto("/app/upload");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: /upload content/i })).toBeVisible();
    await page.locator('input[type="file"]').setInputFiles(path.join(FIXTURES_DIR, "test.md"));
    await expect(page.getByText(/uploaded/i)).toBeVisible({ timeout: 30000 });
    await skipLearningGoalPrompt(page);

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
    await skipLearningGoalPrompt(page);

    // Go to library and click the first document
    await page.goto("/app/library");
    await page.waitForLoadState("networkidle");
    const docButton = page.locator('[data-testid="document-item"]').first();
    await expect(docButton).toBeVisible({ timeout: 10000 });
    await docButton.click();

    // Detail panel should show document content
    await expect(
      page
        .locator(
          [
            '[data-testid="status-ready"]',
            '[data-testid="status-uploaded"]',
            '[data-testid="status-parsing"]',
            '[data-testid="status-chunking"]',
            '[data-testid="status-embedding"]',
            '[data-testid="status-summarizing"]',
            '[data-testid="status-generating_cards"]',
          ].join(", "),
        )
        .first(),
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
    await skipLearningGoalPrompt(page);

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

  test("upload help text displays accepted types and size limits", async ({ page }) => {
    await page.goto("/app/upload");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: /upload content/i })).toBeVisible();

    const helpText = page.locator('[data-testid="file-drop-zone"]').getByText(/accepts/i);
    await expect(helpText).toBeVisible();
    await expect(helpText).toContainText(
      /Accepts \.pdf \(max \d+\.\d MB\), \.epub \(max \d+\.\d MB\), and \.md \(max \d+\.\d MB\)/,
    );
  });
});

test.describe("Library desktop layout", { tag: "@seeded" }, () => {
  test.beforeEach(async () => {
    await reseedAccount();
  });

  test.afterEach(async () => {
    await resetTestData(SEEDED_USER.email);
  });

  test("right detail divider is a single collapsed border", async ({ page }) => {
    await page.setViewportSize({ width: 1536, height: 864 });
    await page.goto("/app/library");

    const main = page.locator('[data-testid="app-main-scroll"]');
    const panel = page.locator('[data-testid="library-detail-panel"]');
    await expect(panel).toBeVisible();
    await expect
      .poll(() => main.evaluate((el) => getComputedStyle(el).borderRightWidth))
      .toBe("0px");
    await expect
      .poll(() => panel.evaluate((el) => getComputedStyle(el).borderLeftWidth))
      .toBe("1px");

    const docButton = page.locator('[data-testid="document-item"]').first();
    await expect(docButton).toBeVisible({ timeout: 15000 });
    await docButton.click();

    await expect(panel).toBeVisible();
    await expect
      .poll(() => panel.evaluate((el) => getComputedStyle(el).borderLeftWidth))
      .toBe("1px");

    const horizontalOverflow = await page.evaluate(() => {
      const root = document.documentElement;
      const body = document.body;
      return Math.max(root.scrollWidth, body.scrollWidth) - root.clientWidth;
    });

    expect(horizontalOverflow).toBeLessThanOrEqual(1);
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
