/**
 * Integration tests: Real provider extraction (merge-to-main / nightly)
 *
 * These tests hit the REAL extraction APIs (markdown.new, YouTube transcript)
 * to verify provider implementations work end-to-end. They require:
 *   - USE_STUB_EXTRACTORS must NOT be "true" (or unset) on the Convex deployment
 *   - Network access to markdown.new and YouTube
 *
 * They do NOT test feed card generation (no GPT calls) — only extraction +
 * chunking + embedding. This keeps cost to embedding-only (~$0.001/test).
 *
 * Excluded from default `npx playwright test` via testIgnore in playwright.config.ts.
 *
 * To run manually:
 *   npx playwright test url-ingestion.slow.spec.ts
 */
import { test, expect } from "@playwright/test";

import { cleanupTestData, signUp } from "./helpers";

test.describe(
  "Real provider integration — article extraction",
  {
    tag: "@slow",
    annotation: [
      {
        type: "criteria",
        description: "P0-5: Real article extraction pipeline (extract + chunk + embed)",
      },
      { type: "issue", description: "https://github.com/jagoral/scrollect/issues/42" },
    ],
  },
  () => {
    test.slow();

    test.beforeEach(async ({ page }) => {
      await signUp(page);
    });

    test.afterEach(async ({ page }) => {
      await cleanupTestData(page);
    });

    test("real article extraction processes URL to ready status with chunks", async ({ page }) => {
      await test.step("submit article URL", async () => {
        await page.goto("/upload");
        await page.getByRole("tab", { name: /paste url/i }).click();
        await page.locator('[data-testid="url-input"]').fill("https://example.com");
        await page.locator('[data-testid="url-submit"]').click();
      });

      await test.step("verify success toast", async () => {
        await expect(page.getByText(/submitted for processing/i)).toBeVisible({ timeout: 30000 });
      });

      await test.step("navigate to document detail", async () => {
        await page.goto("/library");
        const docLink = page.locator("a[href^='/library/']").first();
        await expect(docLink).toBeVisible({ timeout: 10000 });
        await docLink.click();
      });

      await test.step("wait for extraction and chunking to complete", async () => {
        await expect(page.getByText(/chunk/i)).toBeVisible({ timeout: 90000 });
      });
    });
  },
);

test.describe(
  "Real provider integration — YouTube transcript extraction",
  {
    tag: "@slow",
    annotation: [
      {
        type: "criteria",
        description: "P0-6: Real YouTube extraction pipeline (transcript + chunk + embed)",
      },
      { type: "issue", description: "https://github.com/jagoral/scrollect/issues/42" },
    ],
  },
  () => {
    test.slow();

    test.beforeEach(async ({ page }) => {
      await signUp(page);
    });

    test.afterEach(async ({ page }) => {
      await cleanupTestData(page);
    });

    test("real YouTube extraction processes video to ready status with chunks", async ({
      page,
    }) => {
      await test.step("submit YouTube URL", async () => {
        await page.goto("/upload");
        await page.getByRole("tab", { name: /paste url/i }).click();
        await page
          .locator('[data-testid="url-input"]')
          .fill("https://www.youtube.com/watch?v=P6FORpg0KVo");
        await page.locator('[data-testid="url-submit"]').click();
      });

      await test.step("verify success toast", async () => {
        await expect(page.getByText(/submitted for processing/i)).toBeVisible({
          timeout: 30000,
        });
      });

      await test.step("navigate to document detail", async () => {
        await page.goto("/library");
        const docLink = page.locator("a[href^='/library/']").first();
        await expect(docLink).toBeVisible({ timeout: 10000 });
        await docLink.click();
      });

      await test.step("wait for extraction and chunking to complete", async () => {
        await expect(page.getByText(/chunk/i)).toBeVisible({ timeout: 90000 });
      });
    });
  },
);
