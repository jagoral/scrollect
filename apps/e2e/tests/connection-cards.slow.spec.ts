import { test, expect } from "@playwright/test";
import path from "node:path";

import { FIXTURES_DIR, cleanupTestData, signUp } from "./helpers";

const CARD = '[data-testid="post-card"]';

function cardOfType(type: string) {
  return `${CARD}[data-card-type="${type}"]`;
}

async function uploadMarkdownFile(page: import("@playwright/test").Page, filename: string) {
  await page.goto("/upload");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { name: /upload content/i })).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles(path.join(FIXTURES_DIR, filename));
  await expect(page.getByText(/uploaded/i)).toBeVisible({ timeout: 30000 });
}

async function waitForDocumentReady(page: import("@playwright/test").Page) {
  await page.goto("/library");
  await page.waitForLoadState("networkidle");

  const docLinks = page.locator("a[href^='/library/']");
  const count = await docLinks.count();

  for (let i = 0; i < count; i++) {
    const link = docLinks.nth(i);
    const href = await link.getAttribute("href");
    await page.goto(href!);
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(/chunk/i)).toBeVisible({ timeout: 120000 });
  }
}

test.describe("Connection cards - full pipeline (slow)", () => {
  // This test exercises the full pipeline: upload -> process -> embed -> generate -> render.
  // It requires real OpenAI embeddings, Qdrant vector search, and LLM generation.
  // Cost: ~$0.01-0.02 per run (embedding + GPT for small documents).
  test.setTimeout(300000);

  let ephemeralEmail: string;

  test.beforeEach(async ({ page }) => {
    const { email } = await signUp(page);
    ephemeralEmail = email;
  });

  test.afterEach(async () => {
    await cleanupTestData(ephemeralEmail);
  });

  test("cross-document connection: upload 2 overlapping documents, generate feed, verify connection card", async ({
    page,
  }) => {
    // Step 1: Upload two documents with overlapping topics (distributed consensus / CAP theorem)
    await uploadMarkdownFile(page, "connection-doc-a.md");
    await uploadMarkdownFile(page, "connection-doc-b.md");

    // Step 2: Wait for both documents to reach "ready" status (chunked + embedded)
    await waitForDocumentReady(page);

    // Step 3: Generate the feed (request enough cards to increase connection likelihood)
    await page.goto("/feed?count=7");
    await page.waitForLoadState("networkidle");

    // Step 4: Wait for feed cards to appear (generation takes time with real LLM)
    const cards = page.locator(CARD);
    await expect(cards.first()).toBeVisible({ timeout: 120000 });

    // Step 5: Verify at least one connection card exists
    const connectionCards = page.locator(cardOfType("connection"));
    await expect(connectionCards.first()).toBeVisible({
      timeout: 10000,
    });

    // Step 6: Verify the connection card structure
    const firstConnection = connectionCards.first();

    // Connection card must have source panels
    const sources = firstConnection.locator('[data-testid="connection-sources"]');
    await expect(sources).toBeVisible();

    // Both source panels should be visible with document titles
    const sourceA = firstConnection.locator('[data-testid="connection-source-a"]');
    const sourceB = firstConnection.locator('[data-testid="connection-source-b"]');
    await expect(sourceA).toBeVisible();
    await expect(sourceB).toBeVisible();

    // At least one source panel should reference a document title
    const sourceAText = await sourceA.textContent();
    const sourceBText = await sourceB.textContent();
    const allText = `${sourceAText} ${sourceBText}`;
    const hasDocA =
      allText.includes("Distributed Consensus") || allText.includes("distributed consensus");
    const hasDocB = allText.includes("System Design") || allText.includes("system design");
    expect(
      hasDocA || hasDocB,
      `Source panels should reference at least one document title. Got: "${allText}"`,
    ).toBe(true);

    // Connection card must have content
    const content = firstConnection.locator('[data-testid="connection-content"]');
    await expect(content).toBeVisible();
    const contentText = await content.textContent();
    expect(contentText!.length).toBeGreaterThan(20);
  });

  test("single-document connection: upload one multi-section document, verify within-document connection", async ({
    page,
  }) => {
    // Upload a single document with sections that have overlapping concepts (caching in ch1 and ch3)
    await uploadMarkdownFile(page, "connection-single-doc.md");

    // Wait for document to be fully processed
    await waitForDocumentReady(page);

    // Generate feed - request more cards to increase odds of a connection appearing
    await page.goto("/feed?count=7");
    await page.waitForLoadState("networkidle");

    // Wait for cards to render
    const cards = page.locator(CARD);
    await expect(cards.first()).toBeVisible({ timeout: 120000 });

    // For a single document, the system should still generate cards.
    // Connection cards within one document are a best-effort feature -
    // verify the feed generates successfully and contains at least some cards.
    const cardCount = await cards.count();
    expect(cardCount).toBeGreaterThanOrEqual(1);

    // If a connection card is generated (not guaranteed with one document),
    // verify it has the expected structure
    const connectionCards = page.locator(cardOfType("connection"));
    const connectionCount = await connectionCards.count();

    if (connectionCount > 0) {
      const firstConnection = connectionCards.first();
      const sources = firstConnection.locator('[data-testid="connection-sources"]');
      await expect(sources).toBeVisible();

      // Within-document connections should show source panels
      const sourceA = firstConnection.locator('[data-testid="connection-source-a"]');
      await expect(sourceA).toBeVisible();

      const content = firstConnection.locator('[data-testid="connection-content"]');
      await expect(content).toBeVisible();
      const contentText = await content.textContent();
      expect(contentText!.length).toBeGreaterThan(20);
    }
  });
});
