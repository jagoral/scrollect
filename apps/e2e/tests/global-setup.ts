import { test as setup } from "@playwright/test";

import {
  SEEDED_AUTH_FILE,
  SEEDED_USER,
  cleanupTestData,
  dismissCookieConsent,
  ensureSeededAccount,
  seedTestData,
} from "./helpers";

setup("seed and authenticate E2E account", async ({ page }) => {
  await ensureSeededAccount();
  await cleanupTestData(SEEDED_USER.email);
  await seedTestData(SEEDED_USER.email);

  await page.goto("/signin");
  await page.waitForLoadState("networkidle");
  await dismissCookieConsent(page);
  await page.getByLabel("Email").fill(SEEDED_USER.email);
  await page.getByLabel("Password").fill(SEEDED_USER.password);
  await page
    .getByRole("main")
    .getByRole("button", { name: /sign in$/i })
    .click();
  await page.waitForURL(/\/(library|feed)/, { timeout: 15000 });
  await page.context().storageState({ path: SEEDED_AUTH_FILE });
});
