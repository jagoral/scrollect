import { test, expect, type FrameLocator, type Page } from "@playwright/test";
import path from "node:path";

import { FIXTURES_DIR, cleanupTestData, signUp } from "./helpers";

const POLAR_CHECKOUT_URL = /sandbox\.polar\.sh\/checkout/;
const APP_SUCCESS_URL = /\/app\/library/;

test.describe("Landing pricing section", () => {
  test("renders Free + Pro tiers and both CTAs link to /signin", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const pricing = page.locator("section[aria-labelledby='pricing-heading']");
    await expect(pricing).toBeVisible();
    await expect(pricing.getByRole("heading", { level: 3, name: "Free" })).toBeVisible();
    await expect(pricing.getByRole("heading", { level: 3, name: "Pro" })).toBeVisible();
    await expect(pricing.getByText("3 documents total")).toBeVisible();
    await expect(pricing.getByText("30 documents per month")).toBeVisible();

    const getStarted = pricing.getByRole("link", { name: /get started/i });
    const upgrade = pricing.getByRole("link", { name: /upgrade to pro/i });
    await expect(getStarted).toHaveAttribute("href", "/signin");
    await expect(upgrade).toHaveAttribute("href", "/signin");

    await upgrade.click();
    await expect(page).toHaveURL(/\/signin/);
  });
});

test.describe("Free-tier billing UX", () => {
  test.setTimeout(120_000);

  let ephemeralEmail: string;

  test.beforeEach(async ({ page }) => {
    const { email } = await signUp(page);
    ephemeralEmail = email;
  });

  test.afterEach(async () => {
    await cleanupTestData(ephemeralEmail);
  });

  test("new user lands on /app/library with onboarding wizard on welcome step", async ({
    page,
  }) => {
    await expect(page).toHaveURL(APP_SUCCESS_URL);
    await expect(page.getByText(/welcome to scrollect/i)).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /turn something you've read into cards/i }),
    ).toBeVisible();
    await expect(page.getByText("Add content")).toBeVisible();
    await expect(page.getByText("AI generates cards")).toBeVisible();
    await expect(page.getByText("Scroll your feed")).toBeVisible();
  });

  test("Settings shows free-tier usage meter and upgrade dialog opens on CTA", async ({ page }) => {
    await page.goto("/app/settings");
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("heading", { name: /plan & usage/i })).toBeVisible();
    await expect(page.getByText(/free plan/i)).toBeVisible();
    await expect(page.getByText(/lifetime total/i)).toBeVisible();

    await page.getByRole("button", { name: /upgrade to pro/i }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("30 documents per month")).toBeVisible();
    await expect(dialog.getByRole("button", { name: /continue to checkout/i })).toBeVisible();

    await dialog.getByRole("button", { name: /maybe later/i }).click();
    await expect(dialog).toBeHidden();
  });

  test("hitting the 3-document free limit surfaces the limit-specific upgrade dialog", async ({
    page,
  }) => {
    const fixturePath = path.join(FIXTURES_DIR, "test.md");
    for (let i = 0; i < 3; i++) {
      await page.goto("/app/upload");
      await page.getByTestId("file-input").setInputFiles(fixturePath);
      await expect(
        page
          .locator("[data-sonner-toast]")
          .getByText(/uploaded!/i)
          .first(),
      ).toBeVisible({ timeout: 30_000 });
    }

    await page.goto("/app/upload");
    await page.getByTestId("file-input").setInputFiles(fixturePath);

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 20_000 });
    await expect(dialog.getByText(/used all 3 free documents/i)).toBeVisible();
    await expect(dialog.getByRole("button", { name: /continue to checkout/i })).toBeVisible();
  });
});

test.describe("Polar sandbox checkout flow", () => {
  test.setTimeout(180_000);

  let ephemeralEmail: string;

  test.beforeEach(async ({ page }) => {
    const { email } = await signUp(page, { emailDomain: "scrollect.app" });
    ephemeralEmail = email;
  });

  test.afterEach(async () => {
    await cleanupTestData(ephemeralEmail);
  });

  test("free user completes sandbox checkout and unlocks Pro billing UI", async ({ page }) => {
    await page.goto("/app/settings");
    await page.getByRole("button", { name: /upgrade to pro/i }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await Promise.all([
      page.waitForURL(POLAR_CHECKOUT_URL, { timeout: 30_000 }),
      dialog.getByRole("button", { name: /continue to checkout/i }).click(),
    ]);

    await completeSandboxCheckout(page, ephemeralEmail);

    await page.waitForURL(APP_SUCCESS_URL, { timeout: 120_000 });

    await page.goto("/app/settings");
    await expect(page.getByText(/pro plan/i)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/manage billing/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /open billing portal/i })).toBeVisible();
  });
});

async function completeSandboxCheckout(page: Page, email: string) {
  const emailField = page.getByRole("textbox", { name: /^email$/i });
  if (await emailField.isVisible({ timeout: 5_000 }).catch(() => false)) {
    const current = await emailField.inputValue();
    if (!current) await emailField.fill(email);
  }

  await page.getByRole("textbox", { name: /cardholder name/i }).fill("E2E Tester");

  const countryButton = page.locator('button[role="combobox"]');
  await countryButton.click();
  await page.getByRole("option", { name: /^poland$/i }).click();

  const cardFrame = findCardFrame(page);
  await cardFrame.getByRole("textbox", { name: /card number/i }).fill("4242424242424242");
  await cardFrame.getByRole("textbox", { name: /expiration/i }).fill("1230");
  await cardFrame.getByRole("textbox", { name: /security code/i }).fill("123");

  // Polar auto-PATCHes the checkout on every field change and returns 409
  // `CheckoutLocked` if the Subscribe click races with an in-flight PATCH.
  // Letting the network settle before submitting avoids that race.
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: /subscribe now/i }).click();
}

function findCardFrame(page: Page): FrameLocator {
  return page.frameLocator("iframe[title='Secure payment input frame']");
}
