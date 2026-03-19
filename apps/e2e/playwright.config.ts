import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, ".env"), quiet: true });

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [["github"], ["line"], ["html", { outputFolder: "playwright-report", open: "never" }]]
    : "html",

  use: {
    baseURL: "http://localhost:3000",
    trace: "on",
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
        /connection-cards\.spec\.ts/,
        /feed-interactions\.spec\.ts/,
        /feed-interleaving\.spec\.ts/,
        /freshness\.spec\.ts/,
        /learning-goal\.spec\.ts/,
        /multi-type-cards\.spec\.ts/,
        /source-provenance\.spec\.ts/,
        /tagging\.spec\.ts/,
      ],
      fullyParallel: false,
      workers: 1,
    },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
      testIgnore: [
        /global-setup\.ts/,
        /\.slow\.spec\.ts/,
        /connection-cards\.spec\.ts/,
        /feed-interactions\.spec\.ts/,
        /feed-interleaving\.spec\.ts/,
        /freshness\.spec\.ts/,
        /learning-goal\.spec\.ts/,
        /multi-type-cards\.spec\.ts/,
        /source-provenance\.spec\.ts/,
        /tagging\.spec\.ts/,
      ],
    },
    {
      name: "slow",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
      testMatch: /\.slow\.spec\.ts/,
    },
  ],
});
