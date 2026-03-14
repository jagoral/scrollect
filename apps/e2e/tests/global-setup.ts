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

    // Capture auth response headers for debugging
    const authResponsePromise = page.waitForResponse(
      (r) => r.url().includes("/api/auth/") && r.request().method() === "POST",
    );

    await page.getByRole("button", { name: /sign up/i }).click();
    await page.getByLabel("Name").fill(SEEDED_USER.name);
    await page.getByLabel("Email").fill(SEEDED_USER.email);
    await page.getByLabel("Password").fill(SEEDED_USER.password);
    await page.getByRole("button", { name: /create account/i }).click();

    // Log auth response details for debugging
    try {
      const authResponse = await authResponsePromise;
      const allHeaders = await authResponse.allHeaders();
      console.log(`[E2E DEBUG] Auth response: ${authResponse.status()} ${authResponse.url()}`);
      console.log(`[E2E DEBUG] All response headers: ${JSON.stringify(allHeaders)}`);
      const cookies = await page.context().cookies();
      console.log(
        `[E2E DEBUG] Browser cookies: ${JSON.stringify(cookies.map((c) => ({ name: c.name, domain: c.domain, secure: c.secure, path: c.path, httpOnly: c.httpOnly })))}`,
      );
    } catch (e) {
      console.log(`[E2E DEBUG] Failed to capture auth response: ${e}`);
    }

    await expect(page).toHaveURL(/\/(library|feed)/, { timeout: 15000 });
  }

  // Clean up stale data from previous schema, then re-seed
  await cleanupTestData(page);
  await seedTestData(page);
});
