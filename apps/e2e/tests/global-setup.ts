import { test as setup } from "@playwright/test";

import { cleanupTestData, ensureSeededAccount, seedTestData, SEEDED_USER } from "./helpers";

setup("seed E2E account", async () => {
  await ensureSeededAccount();
  await cleanupTestData(SEEDED_USER.email);
  await seedTestData(SEEDED_USER.email);
});
