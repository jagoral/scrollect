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
      grep: /@seeded/,
      use: { ...devices["Desktop Chrome"], storageState: "tests/.auth/seeded.json" },
      dependencies: ["setup"],
      fullyParallel: false,
      workers: 1,
    },
    {
      name: "chromium",
      grepInvert: /@seeded/,
      use: { ...devices["Desktop Chrome"] },
      testIgnore: [/global-setup\.ts/],
    },
  ],
});
