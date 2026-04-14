import { test, expect } from "@playwright/test";

import { goToFirstDocument, reseedAccount } from "./helpers";

test.describe("Learning goal - document detail (seeded account)", { tag: "@seeded" }, () => {
  test.setTimeout(60000);

  test.beforeEach(async () => {
    await reseedAccount();
  });

  test.afterEach(async () => {
    await reseedAccount();
  });

  test("learning goal textarea is visible on a ready document", async ({ page }) => {
    await goToFirstDocument(page);

    const section = page.locator('[data-testid="learning-goal-section"]');
    await expect(section).toBeVisible({ timeout: 15000 });

    const textarea = page.locator('[data-testid="learning-goal-textarea"]');
    await expect(textarea).toBeVisible();
    await expect(textarea).toHaveAttribute(
      "placeholder",
      "What do you want to learn from this document?",
    );

    const charCount = page.locator('[data-testid="learning-goal-char-count"]');
    await expect(charCount).toBeVisible();
    await expect(charCount).toHaveText("0/500");
  });

  test("typing a goal and blurring persists it across page reload", async ({ page }) => {
    await goToFirstDocument(page);

    const textarea = page.locator('[data-testid="learning-goal-textarea"]');
    await expect(textarea).toBeVisible({ timeout: 15000 });

    const goal = "Understand distributed consensus algorithms";
    await textarea.fill(goal);

    const charCount = page.locator('[data-testid="learning-goal-char-count"]');
    await expect(charCount).toHaveText(`${goal.length}/500`);

    // Blur to trigger auto-save
    await textarea.blur();

    // Wait for the "Saved" toast to confirm persistence
    await expect(page.getByText("Learning goal saved")).toBeVisible({ timeout: 10000 });

    // Reload the page and re-select the document to verify the goal persists
    await page.goto("/app/library");
    await page.waitForLoadState("networkidle");
    const docButton = page.locator('[data-testid="document-item"]').first();
    await expect(docButton).toBeVisible({ timeout: 15000 });
    await docButton.click();

    // Wait for the document detail to fully load (Convex subscription must reconnect)
    await expect(page.locator('[data-testid="learning-goal-section"]')).toBeVisible({
      timeout: 15000,
    });

    const reloadedTextarea = page.locator('[data-testid="learning-goal-textarea"]');
    await expect(reloadedTextarea).toHaveValue(goal, { timeout: 10000 });
  });

  test("clearing the goal and blurring removes it", async ({ page }) => {
    await goToFirstDocument(page);

    const textarea = page.locator('[data-testid="learning-goal-textarea"]');
    await expect(textarea).toBeVisible({ timeout: 15000 });

    // First, set a goal so there is something to clear
    await textarea.fill("Temporary goal to clear");
    await textarea.blur();
    await expect(page.getByText("Learning goal saved")).toBeVisible({ timeout: 10000 });

    // Clear the textarea
    await textarea.fill("");
    await textarea.blur();
    await expect(page.getByText("Learning goal cleared")).toBeVisible({ timeout: 10000 });

    // Reload the page and re-select the document to verify the goal is gone
    await page.goto("/app/library");
    await page.waitForLoadState("networkidle");
    const docButton = page.locator('[data-testid="document-item"]').first();
    await expect(docButton).toBeVisible({ timeout: 15000 });
    await docButton.click();

    // Wait for the document detail to fully load (Convex subscription must reconnect)
    await expect(page.locator('[data-testid="learning-goal-section"]')).toBeVisible({
      timeout: 15000,
    });

    const reloadedTextarea = page.locator('[data-testid="learning-goal-textarea"]');
    await expect(reloadedTextarea).toHaveValue("", { timeout: 10000 });

    const charCount = page.locator('[data-testid="learning-goal-char-count"]');
    await expect(charCount).toHaveText("0/500");
  });
});
