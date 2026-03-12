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
    reducedMotion: "reduce",
  },

  projects: [
    {
      name: "setup",
      testMatch: /global-setup\.ts/,
    },
    {
      name: "seeded",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
      testMatch: [
        /feed-interactions\.spec\.ts/,
        /multi-type-cards\.spec\.ts/,
        /source-provenance\.spec\.ts/,
      ],
      fullyParallel: false,
    },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
      testIgnore: [
        /global-setup\.ts/,
        /\.slow\.spec\.ts/,
        /feed-interactions\.spec\.ts/,
        /multi-type-cards\.spec\.ts/,
        /source-provenance\.spec\.ts/,
      ],
    },
    {
      name: "slow",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
      testMatch: /\.slow\.spec\.ts/,
    },
  ],

  webServer: {
    command: "bun run --cwd ../web dev",
    url: "http://localhost:3001",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
