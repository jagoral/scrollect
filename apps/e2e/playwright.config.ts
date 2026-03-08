import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "html",

  use: {
    baseURL: "http://localhost:3001",
    trace: "on-first-retry",
  },

  projects: [
    {
      name: "setup",
      testMatch: /global-setup\.ts/,
    },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
      testIgnore: /global-setup\.ts/,
    },
  ],

  webServer: {
    command: "cd ../.. && bun turbo -F @scrollect/web dev",
    url: "http://localhost:3001",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
