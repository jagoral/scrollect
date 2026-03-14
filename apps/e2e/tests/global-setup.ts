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
    // Listen for all Set-Cookie headers to detect cookie clearing
    page.on("response", async (response) => {
      const headers = await response.allHeaders();
      if (headers["set-cookie"]) {
        console.log(
          `[E2E DEBUG] ${response.url()} Set-Cookie: ${headers["set-cookie"].substring(0, 200)}`,
        );
      }
    });

    await page.getByRole("button", { name: /sign up/i }).click();
    await page.getByLabel("Name").fill(SEEDED_USER.name);
    await page.getByLabel("Email").fill(SEEDED_USER.email);
    await page.getByLabel("Password").fill(SEEDED_USER.password);
    await page.getByRole("button", { name: /create account/i }).click();
    await expect(page).toHaveURL(/\/(library|feed)/, { timeout: 15000 });

    // Debug: check cookies after the page load
    const cookiesAfterNav = await page.context().cookies();
    console.log(
      `[E2E DEBUG] Cookies after navigation: ${JSON.stringify(cookiesAfterNav.map((c) => c.name))}`,
    );

    // Debug: check if fetch includes cookies
    const fetchDebug = await page.evaluate(async () => {
      const res = await fetch("/api/e2e-seed", { method: "POST", credentials: "same-origin" });
      return { status: res.status, body: await res.text() };
    });
    console.log(
      `[E2E DEBUG] Direct fetch seed result: ${fetchDebug.status} ${fetchDebug.body.substring(0, 200)}`,
    );
  }

  // Clean up stale data from previous schema, then re-seed
  await cleanupTestData(page);
  await seedTestData(page);
});
