import { test, expect } from "@playwright/test";
import path from "node:path";

import { FIXTURES_DIR, SEEDED_USER, goToFirstDocument, reseedAccount, signIn } from "./helpers";

test.describe("Pocketbook highlights import (seeded account)", () => {
  test.setTimeout(60000);

  test.beforeEach(async ({ page }) => {
    await reseedAccount();
    await signIn(page, SEEDED_USER.email, SEEDED_USER.password);
  });

  test.afterEach(async () => {
    await reseedAccount();
  });

  test("Import Highlights button is visible on ready document detail page", async ({ page }) => {
    await goToFirstDocument(page);

    await expect(page.locator('[data-testid="import-highlights-button"]')).toBeVisible({
      timeout: 15000,
    });
  });

  test("import dialog shows Pocketbook instructions", async ({ page }) => {
    await goToFirstDocument(page);

    await page.locator('[data-testid="import-highlights-button"]').click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 5000 });
    await expect(dialog).toContainText(/pocketbook/i);
  });

  test("file picker accepts only .html files", async ({ page }) => {
    await goToFirstDocument(page);

    await page.locator('[data-testid="import-highlights-button"]').click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5000 });

    const fileInput = page.locator('[data-testid="highlights-file-input"]');
    const accept = await fileInput.getAttribute("accept");
    expect(accept).toContain(".html");
  });

  test("successful import shows count toast and highlights appear on detail page", async ({
    page,
  }) => {
    await goToFirstDocument(page);

    await page.locator('[data-testid="import-highlights-button"]').click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5000 });

    await page
      .locator('[data-testid="highlights-file-input"]')
      .setInputFiles(path.join(FIXTURES_DIR, "pocketbook-highlights.html"));

    await expect(page.locator('[data-testid="select-highlights-file"]')).toContainText(
      /3 highlight/i,
      { timeout: 5000 },
    );

    await page.locator('[data-testid="confirm-import-highlights"]').click();

    await expect(page.locator("[data-sonner-toast]").getByText(/3 highlight/i)).toBeVisible({
      timeout: 15000,
    });

    // Dialog should close after successful import
    await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: 5000 });

    // Highlights section should now be visible on the detail page
    const highlightsSection = page.locator('[data-testid="highlights-section"]');
    await expect(highlightsSection).toBeVisible({ timeout: 15000 });

    // Expand the collapsible to reveal highlight items
    await highlightsSection.locator('[data-slot="collapsible-trigger"]').click();

    // All 3 highlights should be displayed
    await expect(highlightsSection.locator('[data-testid^="highlight-"]')).toHaveCount(3, {
      timeout: 10000,
    });

    // Verify actual highlight text is rendered
    await expect(highlightsSection).toContainText(
      "The first rule of testing is that you write tests before you write code.",
    );
    await expect(highlightsSection).toContainText("Software is never finished, only abandoned.");
    await expect(highlightsSection).toContainText("Make it work, make it right, make it fast.");
  });

  test("re-importing same file shows skipped count (deduplication)", async ({ page }) => {
    await goToFirstDocument(page);

    // First import
    await page.locator('[data-testid="import-highlights-button"]').click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5000 });
    await page
      .locator('[data-testid="highlights-file-input"]')
      .setInputFiles(path.join(FIXTURES_DIR, "pocketbook-highlights.html"));
    await expect(page.locator('[data-testid="select-highlights-file"]')).toContainText(
      /3 highlight/i,
      { timeout: 5000 },
    );
    await page.locator('[data-testid="confirm-import-highlights"]').click();
    await expect(page.locator("[data-sonner-toast]").getByText(/3 highlight/i)).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: 5000 });

    // Second import of same file
    await page.locator('[data-testid="import-highlights-button"]').click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5000 });
    await page
      .locator('[data-testid="highlights-file-input"]')
      .setInputFiles(path.join(FIXTURES_DIR, "pocketbook-highlights.html"));
    await expect(page.locator('[data-testid="select-highlights-file"]')).toContainText(
      /3 highlight/i,
      { timeout: 5000 },
    );
    await page.locator('[data-testid="confirm-import-highlights"]').click();

    await expect(page.locator("[data-sonner-toast]").getByText(/already imported/i)).toBeVisible({
      timeout: 15000,
    });

    // Still only 3 highlights on the page (no duplicates)
    const highlightsSection = page.locator('[data-testid="highlights-section"]');
    await highlightsSection.locator('[data-slot="collapsible-trigger"]').click();
    await expect(highlightsSection.locator('[data-testid^="highlight-"]')).toHaveCount(3, {
      timeout: 10000,
    });
  });

  test("Remove all button deletes highlights", async ({ page }) => {
    await goToFirstDocument(page);

    // Import first
    await page.locator('[data-testid="import-highlights-button"]').click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5000 });
    await page
      .locator('[data-testid="highlights-file-input"]')
      .setInputFiles(path.join(FIXTURES_DIR, "pocketbook-highlights.html"));
    await expect(page.locator('[data-testid="select-highlights-file"]')).toContainText(
      /3 highlight/i,
      { timeout: 5000 },
    );
    await page.locator('[data-testid="confirm-import-highlights"]').click();
    await expect(page.locator("[data-sonner-toast]").getByText(/3 highlight/i)).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: 5000 });

    // Verify highlights are visible
    const highlightsSection = page.locator('[data-testid="highlights-section"]');
    await expect(highlightsSection).toBeVisible({ timeout: 15000 });

    // Click remove all
    await page.locator('[data-testid="remove-all-highlights"]').click();

    // Confirm deletion in dialog
    const confirmDialog = page.getByRole("alertdialog");
    await expect(confirmDialog).toBeVisible({ timeout: 5000 });
    await confirmDialog.locator('[data-testid="confirm-remove-highlights"]').click();

    // Highlights section should be gone
    await expect(highlightsSection).not.toBeVisible({ timeout: 15000 });
  });
});
