import { test, expect } from "@playwright/test";

import { signUp } from "./helpers";

test.describe("Account deletion", () => {
  test.setTimeout(120000);

  test("user can delete their account via settings page", async ({ page }) => {
    const { email } = await signUp(page);

    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("heading", { name: /settings/i })).toBeVisible();
    await expect(page.getByText(email)).toBeVisible();
    await expect(page.getByRole("heading", { name: /danger zone/i })).toBeVisible();

    await page.getByTestId("delete-account-button").click();

    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/permanently delete your account/i)).toBeVisible();

    const confirmButton = page.getByTestId("confirm-delete-account-button");
    await expect(confirmButton).toBeDisabled();

    await page.getByTestId("delete-confirmation-input").fill("DELETE");
    await expect(confirmButton).toBeEnabled();

    await confirmButton.click();

    // Verify the handler is running (button text changes to "Deleting...")
    await expect(confirmButton).toContainText("Deleting", { timeout: 5000 });

    // After deletion, the page navigates away from settings
    await page.waitForURL((url) => !url.pathname.includes("/settings"), { timeout: 60000 });
  });

  test("cancel button closes the dialog without deleting", async ({ page }) => {
    await signUp(page);

    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    await page.getByTestId("delete-account-button").click();

    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible();

    await page.getByTestId("cancel-delete-account-button").click();
    await expect(dialog).not.toBeVisible();

    await expect(page.getByRole("heading", { name: /settings/i })).toBeVisible();
  });

  test("confirmation input resets when dialog is reopened", async ({ page }) => {
    await signUp(page);

    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    await page.getByTestId("delete-account-button").click();

    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible();

    await page.getByTestId("delete-confirmation-input").fill("DEL");
    await page.getByTestId("cancel-delete-account-button").click();
    await expect(dialog).not.toBeVisible();

    await page.getByTestId("delete-account-button").click();
    await expect(dialog).toBeVisible();

    const input = page.getByTestId("delete-confirmation-input");
    await expect(input).toHaveValue("");
  });
});
