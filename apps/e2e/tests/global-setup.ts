import { test as setup, expect } from "@playwright/test";

import { SEEDED_USER, cleanupTestData, seedTestData } from "./helpers";

setup("create and seed E2E account", async ({ page }) => {
  // Try sign-in first (account may exist from previous run)
  await page.goto("/signin");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Email").fill(SEEDED_USER.email);
  await page.getByLabel("Password").fill(SEEDED_USER.password);
  await page
    .getByRole("main")
    .getByRole("button", { name: /sign in$/i })
    .click();

  // Wait for either successful redirect or error toast
  const succeeded = await Promise.race([
    page.waitForURL(/\/(library|feed)/, { timeout: 10000 }).then(() => true),
    page
      .locator('[data-sonner-toast][data-type="error"]')
      .waitFor({ timeout: 10000 })
      .then(() => false),
  ]).catch(() => false);

  // If sign-in failed, sign up instead
  if (!succeeded) {
    await page.goto("/signin");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: /sign up/i }).click();
    await page.getByLabel("Name").fill(SEEDED_USER.name);
    await page.getByLabel("Email").fill(SEEDED_USER.email);
    await page.getByLabel("Password").fill(SEEDED_USER.password);
    await page.getByRole("button", { name: /create account/i }).click();
    await expect(page).toHaveURL(/\/(library|feed)/, { timeout: 15000 });
  }

  // Clean up stale data from previous schema, then re-seed
  await cleanupTestData(SEEDED_USER.email);
  await seedTestData(SEEDED_USER.email);
});
