import { test, expect } from "@playwright/test";

import { SEEDED_USER, resetTestData, signIn } from "./helpers";

const CARD = '[data-testid="post-card"]';

function cardOfType(type: string) {
  return `${CARD}[data-card-type="${type}"]`;
}

test.describe("Multi-type card rendering", () => {
  test.setTimeout(60000);

  test.beforeEach(async ({ page }) => {
    await signIn(page, SEEDED_USER.email, SEEDED_USER.password);
    await page.goto("/feed?noAutoGenerate");
    await page.waitForLoadState("networkidle");
    await expect(page.locator(CARD).first()).toBeVisible({ timeout: 15000 });
  });

  test.afterEach(async ({ page }) => {
    await resetTestData(page);
  });

  test("feed contains all 5 card types", async ({ page }) => {
    const cards = page.locator(CARD);
    await expect(cards).toHaveCount(7, { timeout: 15000 });

    const types = await cards.evaluateAll((els) => [
      ...new Set(els.map((el) => el.getAttribute("data-card-type"))),
    ]);

    for (const expected of ["insight", "quiz", "quote", "summary", "connection"]) {
      expect(types, `missing card type: ${expected}`).toContain(expected);
    }
  });

  test("insight card has source badge and action buttons", async ({ page }) => {
    const card = page.locator(cardOfType("insight")).first();
    await expect(card).toBeVisible();

    await expect(card.locator('[data-testid="source-badge"]')).toBeVisible();
    await expect(card.locator('[data-testid="like-button"]')).toBeVisible();
    await expect(card.locator('[data-testid="dislike-button"]')).toBeVisible();
    await expect(card.locator('[data-testid="save-button"]')).toBeVisible();
  });

  test("quote card displays quoted text and source badge", async ({ page }) => {
    const card = page.locator(cardOfType("quote")).first();
    await expect(card).toBeVisible();

    await expect(card.locator('[data-testid="quoted-text"]')).toBeVisible();
    await expect(card.locator('[data-testid="source-badge"]')).toBeVisible();
  });

  test("summary card displays bullet points", async ({ page }) => {
    const card = page.locator(cardOfType("summary")).first();
    await expect(card).toBeVisible();

    const bullets = card.locator('[data-testid="summary-bullets"] li');
    await expect(bullets.first()).toBeVisible();
    expect(await bullets.count()).toBeGreaterThanOrEqual(2);

    await expect(card.locator('[data-testid="source-badge"]')).toBeVisible();
  });
});

test.describe("Quiz card interactions", () => {
  test.setTimeout(60000);

  test.beforeEach(async ({ page }) => {
    await signIn(page, SEEDED_USER.email, SEEDED_USER.password);
    await page.goto("/feed?noAutoGenerate");
    await page.waitForLoadState("networkidle");
    await expect(page.locator(CARD).first()).toBeVisible({ timeout: 15000 });
  });

  test.afterEach(async ({ page }) => {
    await resetTestData(page);
  });

  test("reveal quiz: answer hidden until tap", async ({ page }) => {
    const card = page.locator(`${cardOfType("quiz")}[data-quiz-variant="true_false"]`).first();
    await expect(card).toBeVisible();

    await expect(card.locator('[data-testid="quiz-question"]')).toBeVisible();
    await expect(card.locator('[data-testid="quiz-answer"]')).not.toBeVisible();

    await card.locator('[data-testid="quiz-reveal-button"]').click();

    await expect(card.locator('[data-testid="quiz-answer"]')).toBeVisible({ timeout: 5000 });
    await expect(card.locator('[data-testid="quiz-explanation"]')).toBeVisible();
  });

  test("multiple-choice quiz: correct answer highlights green", async ({ page }) => {
    const card = page.locator(`${cardOfType("quiz")}[data-quiz-variant="multiple_choice"]`).first();
    await expect(card).toBeVisible();

    await expect(card.locator('[data-testid="quiz-question"]')).toBeVisible();

    const options = card.locator('[data-testid="quiz-option"]');
    await expect(options).toHaveCount(4);

    // Seed data: correct answer is index 0
    await options.first().click();

    await expect(options.first()).toHaveAttribute("data-option-state", "correct");
    await expect(card.locator('[data-testid="quiz-explanation"]')).toBeVisible({ timeout: 5000 });
  });

  test("multiple-choice quiz: wrong answer marks both incorrect and correct", async ({ page }) => {
    const card = page.locator(`${cardOfType("quiz")}[data-quiz-variant="multiple_choice"]`).first();
    await expect(card).toBeVisible();

    const options = card.locator('[data-testid="quiz-option"]');

    // Tap wrong answer (index 1); correct is index 0
    await options.nth(1).click();

    await expect(options.nth(1)).toHaveAttribute("data-option-state", "incorrect");
    await expect(options.first()).toHaveAttribute("data-option-state", "correct");
    await expect(card.locator('[data-testid="quiz-explanation"]')).toBeVisible({ timeout: 5000 });
  });
});

test.describe("Source provenance", () => {
  test.setTimeout(60000);

  test.beforeEach(async ({ page }) => {
    await signIn(page, SEEDED_USER.email, SEEDED_USER.password);
    await page.goto("/feed?noAutoGenerate");
    await page.waitForLoadState("networkidle");
    await expect(page.locator(CARD).first()).toBeVisible({ timeout: 15000 });
  });

  test.afterEach(async ({ page }) => {
    await resetTestData(page);
  });

  test("every card has a source badge", async ({ page }) => {
    const cards = page.locator(CARD);
    const count = await cards.count();

    for (let i = 0; i < count; i++) {
      const card = cards.nth(i);
      const type = await card.getAttribute("data-card-type");
      // Connection cards render their own dual-title badge
      const selector =
        type === "connection"
          ? '[data-testid="connection-source-badge"]'
          : '[data-testid="source-badge"]';
      await expect(card.locator(selector)).toBeVisible({ timeout: 5000 });
    }
  });

  test("connection card badge contains both document titles", async ({ page }) => {
    const card = page.locator(cardOfType("connection")).first();
    await expect(card).toBeVisible();

    const badge = card.locator('[data-testid="connection-source-badge"]');
    await expect(badge).toBeVisible();
    await expect(badge).toContainText("E2E Seed Document");
    await expect(badge).toContainText("E2E Seed Document 2");
  });

  test("expand sheet shows source chunks with primary marker", async ({ page }) => {
    // Use an insight card for deterministic single-source sheet
    const card = page.locator(cardOfType("insight")).first();
    await expect(card).toBeVisible();

    await card.locator('[data-testid="expand-button"]').click();

    const sheet = page.locator('[data-testid="source-sheet"]');
    await expect(sheet).toBeVisible({ timeout: 10000 });

    const primary = sheet.locator('[data-testid="source-chunk"][data-primary="true"]');
    await expect(primary).toBeVisible({ timeout: 10000 });

    const chunks = sheet.locator('[data-testid="source-chunk"]');
    expect(await chunks.count()).toBeGreaterThanOrEqual(1);
  });
});
