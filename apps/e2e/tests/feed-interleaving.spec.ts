import { test, expect } from "@playwright/test";

import { SEEDED_USER, reseedAccount, resetTestData, signInToSeededFeed } from "./helpers";

const CARD = '[data-testid="post-card"]';

test.describe("Feed v2 ordering constraints", { tag: "@seeded" }, () => {
  test.setTimeout(60000);

  test.beforeEach(async ({ page }) => {
    await reseedAccount();
    await signInToSeededFeed(page);
  });

  test.afterEach(async () => {
    await resetTestData(SEEDED_USER.email);
  });

  test("no more than 3 consecutive cards share the same type", async ({ page }) => {
    const cards = page.locator(CARD);
    await expect(cards.first()).toBeVisible();

    const cardCount = await cards.count();
    expect(cardCount).toBeGreaterThan(0);

    const types = await cards.evaluateAll((els) =>
      els.map((el) => el.getAttribute("data-post-type")),
    );

    // Check that no more than MAX_CONSECUTIVE_SAME_TYPE (3) consecutive cards share a type
    let consecutiveCount = 1;
    for (let i = 1; i < types.length; i++) {
      if (types[i] === types[i - 1]) {
        consecutiveCount++;
        expect(
          consecutiveCount,
          `Found ${consecutiveCount} consecutive "${types[i]}" cards at index ${i - consecutiveCount + 1}-${i}`,
        ).toBeLessThanOrEqual(3);
      } else {
        consecutiveCount = 1;
      }
    }
  });

  test("all card types present are valid post types", async ({ page }) => {
    const cards = page.locator(CARD);
    await expect(cards.first()).toBeVisible();

    const types = await cards.evaluateAll((els) =>
      els.map((el) => el.getAttribute("data-post-type")),
    );

    const validTypes = ["insight", "quiz", "quote", "summary", "connection"];
    for (const type of types) {
      expect(validTypes, `unexpected card type: ${type}`).toContain(type);
    }
  });

  test("document diversity: no single document exceeds 40% of cards", async ({ page }) => {
    const cards = page.locator(CARD);
    await expect(cards.first()).toBeVisible();

    const cardCount = await cards.count();
    // Only meaningful with enough cards to test the constraint
    if (cardCount < 5) return;

    // Collect source badge texts to identify document sources
    const sourceBadgeTexts = await cards
      .locator('[data-testid="source-badge"]')
      .evaluateAll((els) => els.map((el) => el.textContent?.trim() ?? ""));

    // Count cards per document title
    const documentCounts = new Map<string, number>();
    for (const text of sourceBadgeTexts) {
      // Extract the document title (before any " - " separator)
      const docTitle = text.split(" - ")[0]?.trim() ?? text;
      documentCounts.set(docTitle, (documentCounts.get(docTitle) ?? 0) + 1);
    }

    // Verify no single document exceeds 40% of total
    const maxAllowed = Math.ceil(cardCount * 0.4);
    for (const [docTitle, count] of documentCounts) {
      expect(
        count,
        `Document "${docTitle}" has ${count}/${cardCount} cards (${Math.round((count / cardCount) * 100)}%), exceeds 40% cap`,
      ).toBeLessThanOrEqual(maxAllowed);
    }
  });
});
