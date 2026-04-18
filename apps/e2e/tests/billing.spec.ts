import { test, expect } from "@playwright/test";
import path from "node:path";

import { FIXTURES_DIR, cleanupTestData, seedProSubscription, signUp } from "./helpers";

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

// Bypasses the real sandbox checkout and seeds an active Pro subscription
// directly into the Polar component's tables. Required because Polar only
// supports one webhook URL per organization, so subscription.created events
// from a real sandbox checkout don't reach per-PR Convex preview deployments.
// The real webhook handler is covered by a separate unit test against a signed
// payload.
test.describe("Pro-tier billing UX", () => {
  test.setTimeout(60_000);

  let ephemeralEmail: string;

  test.beforeEach(async ({ page }) => {
    const { email } = await signUp(page);
    ephemeralEmail = email;
    await seedProSubscription(email);
  });

  test.afterEach(async () => {
    await cleanupTestData(ephemeralEmail);
  });

  test("Settings shows Pro plan state and billing portal entry point", async ({ page }) => {
    await page.goto("/app/settings");
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("heading", { name: /plan & usage/i })).toBeVisible();
    await expect(page.getByText(/pro plan/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/manage billing/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /open billing portal/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /upgrade to pro/i })).toHaveCount(0);
  });
});
