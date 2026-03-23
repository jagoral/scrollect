import { test, expect } from "@playwright/test";

import { SEEDED_USER, resetTestData, signInToSeededFeed } from "./helpers";

const CARD = '[data-testid="post-card"]';

test.describe("Feed interleaving rules", { tag: "@seeded" }, () => {
  test.setTimeout(60000);

  test.beforeEach(async ({ page }) => {
    await signInToSeededFeed(page);
  });

  test.afterEach(async () => {
    await resetTestData(SEEDED_USER.email);
  });

  test("first card is a quiz or connection (hook card)", async ({ page }) => {
    const firstCard = page.locator(CARD).first();
    await expect(firstCard).toBeVisible();

    const firstType = await firstCard.getAttribute("data-card-type");
    expect(
      ["quiz", "connection"],
      `Expected first card to be quiz or connection, got "${firstType}"`,
    ).toContain(firstType);
  });

  test("no two consecutive cards share the same type", async ({ page }) => {
    const cards = page.locator(CARD);
    await expect(cards).toHaveCount(7, { timeout: 15000 });

    const types = await cards.evaluateAll((els) =>
      els.map((el) => el.getAttribute("data-card-type")),
    );

    for (let i = 0; i < types.length - 1; i++) {
      expect(types[i], `Cards at index ${i} and ${i + 1} are both "${types[i]}"`).not.toBe(
        types[i + 1],
      );
    }
  });

  test("all card types are preserved after interleaving", async ({ page }) => {
    const cards = page.locator(CARD);
    await expect(cards).toHaveCount(7, { timeout: 15000 });

    const types = await cards.evaluateAll((els) =>
      els.map((el) => el.getAttribute("data-card-type")),
    );

    const uniqueTypes = [...new Set(types)];
    expect(uniqueTypes).toHaveLength(5);
    for (const expected of ["insight", "quiz", "quote", "summary", "connection"]) {
      expect(uniqueTypes, `missing card type: ${expected}`).toContain(expected);
    }
  });
});
