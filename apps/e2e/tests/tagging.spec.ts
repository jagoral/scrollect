import { test, expect } from "@playwright/test";
import path from "node:path";

import {
  FIXTURES_DIR,
  SEEDED_USER,
  cleanupTestData,
  seedTestData,
  signIn,
  signUp,
} from "./helpers";

async function navigateToFirstDocument(page: import("@playwright/test").Page) {
  await signIn(page, SEEDED_USER.email, SEEDED_USER.password);
  await page.goto("/library");
  const docLink = page.locator("a[href^='/library/']").first();
  await expect(docLink).toBeVisible({ timeout: 10000 });
  await docLink.click();
  await expect(page).toHaveURL(/\/library\/.+/);
}

async function reseedAccount(page: import("@playwright/test").Page) {
  await cleanupTestData(page);
  await seedTestData(page);
}

test.describe("Tagging — document detail: AI tags (seeded account)", () => {
  test.setTimeout(60000);

  test.afterEach(async ({ page }) => {
    await reseedAccount(page);
  });

  // P0-5: Ready documents show tag chips with AI indicator for AI-sourced tags
  test("document detail page shows AI-suggested tags with sparkle indicator", async ({ page }) => {
    await navigateToFirstDocument(page);

    await expect(page.locator('[data-testid="document-tag-section"]')).toBeVisible({
      timeout: 15000,
    });

    const aiTag = page.locator('[data-tag-source="ai"]').first();
    await expect(aiTag).toBeVisible({ timeout: 15000 });
  });

  // AI vs manual visual distinction
  test("AI-suggested and manual tags are visually distinguishable", async ({ page }) => {
    await navigateToFirstDocument(page);
    await expect(page.locator('[data-testid="document-tag-section"]')).toBeVisible({
      timeout: 15000,
    });

    const aiTags = page.locator('[data-tag-source="ai"]');
    await expect(aiTags.first()).toBeVisible({ timeout: 15000 });

    await page.locator('[data-testid="add-tag-button"]').click();
    await page.locator('[data-testid="tag-search-input"]').fill("manual-visual-test");
    await page.locator('[data-testid="create-tag-option"]').click();
    await expect(
      page.locator('[data-testid="tag-badge-manual-visual-test"][data-tag-source="manual"]'),
    ).toBeVisible({ timeout: 10000 });

    expect(await page.locator('[data-tag-source="ai"]').count()).toBeGreaterThan(0);
    expect(await page.locator('[data-tag-source="manual"]').count()).toBeGreaterThan(0);
  });
});

test.describe("Tagging — document detail: manual operations (seeded account)", () => {
  test.setTimeout(60000);

  test.afterEach(async ({ page }) => {
    await reseedAccount(page);
  });

  // P0-7: Combobox "Create '{name}'" option creates new tag and applies it
  test("user can create a new tag via combobox", async ({ page }) => {
    await navigateToFirstDocument(page);
    await expect(page.locator('[data-testid="document-tag-section"]')).toBeVisible({
      timeout: 15000,
    });

    await page.locator('[data-testid="add-tag-button"]').click();
    await page.locator('[data-testid="tag-search-input"]').fill("brand-new-unique-tag");

    const createOption = page.locator('[data-testid="create-tag-option"]');
    await expect(createOption).toBeVisible({ timeout: 5000 });
    await createOption.click();

    await expect(
      page.locator('[data-testid="tag-badge-brand-new-unique-tag"][data-tag-source="manual"]'),
    ).toBeVisible({ timeout: 10000 });
  });

  // P0-6: Combobox lets user add existing tags with source "manual"
  test("user can add an existing tag via combobox", async ({ page }) => {
    await navigateToFirstDocument(page);
    await expect(page.locator('[data-testid="document-tag-section"]')).toBeVisible({
      timeout: 15000,
    });

    // Create a tag on this document so it exists as a user tag
    await page.locator('[data-testid="add-tag-button"]').click();
    await page.locator('[data-testid="tag-search-input"]').fill("existing-tag-test");
    await page.locator('[data-testid="create-tag-option"]').click();
    await expect(page.locator('[data-testid="tag-badge-existing-tag-test"]')).toBeVisible({
      timeout: 10000,
    });

    // Navigate to the second document
    await page.goto("/library");
    const docLinks = page.locator("a[href^='/library/']");
    await expect(docLinks.first()).toBeVisible({ timeout: 10000 });
    const count = await docLinks.count();
    expect(count).toBeGreaterThan(1);

    await docLinks.nth(1).click();
    await expect(page).toHaveURL(/\/library\/.+/);
    await expect(page.locator('[data-testid="document-tag-section"]')).toBeVisible({
      timeout: 15000,
    });

    // Open combobox and search for the tag we created — cmdk needs search text to show filtered results
    await page.locator('[data-testid="add-tag-button"]').click();
    await page.locator('[data-testid="tag-search-input"]').fill("existing-tag-test");

    // The tag should appear as an existing option (not "Create" since it already exists)
    await expect(page.locator('[data-testid="tag-option-existing-tag-test"]')).toBeVisible({
      timeout: 5000,
    });
    await page.locator('[data-testid="tag-option-existing-tag-test"]').click();
    await expect(
      page.locator('[data-testid="tag-badge-existing-tag-test"][data-tag-source="manual"]'),
    ).toBeVisible({ timeout: 10000 });
  });

  // P0-8: "x" on chip removes tag-document association (tag itself persists for reuse)
  test("user can remove a tag via the x button and tag persists for reuse", async ({ page }) => {
    await navigateToFirstDocument(page);
    await expect(page.locator('[data-testid="document-tag-section"]')).toBeVisible({
      timeout: 15000,
    });

    // Add a manual tag
    await page.locator('[data-testid="add-tag-button"]').click();
    await page.locator('[data-testid="tag-search-input"]').fill("removable-tag");
    await page.locator('[data-testid="create-tag-option"]').click();
    await expect(page.locator('[data-testid="tag-badge-removable-tag"]')).toBeVisible({
      timeout: 10000,
    });

    // Wait for server to confirm the add (replace optimistic data with real IDs)
    await page.waitForTimeout(2000);

    // Remove it
    await page.locator('[data-testid="tag-remove-removable-tag"]').click();
    await expect(page.locator('[data-testid="tag-badge-removable-tag"]')).not.toBeVisible({
      timeout: 10000,
    });

    // Tag should persist for reuse — search with exact name for cmdk matching
    await page.locator('[data-testid="add-tag-button"]').click();
    await page.locator('[data-testid="tag-search-input"]').fill("removable-tag");
    await expect(page.locator('[data-testid="tag-option-removable-tag"]')).toBeVisible({
      timeout: 5000,
    });
  });

  // P0-13: Tag combobox autocomplete filters in real-time, excludes already-applied tags
  test("combobox autocomplete filters in real-time and excludes applied tags", async ({ page }) => {
    await navigateToFirstDocument(page);
    await expect(page.locator('[data-testid="document-tag-section"]')).toBeVisible({
      timeout: 15000,
    });

    await page.locator('[data-testid="add-tag-button"]').click();
    await page.locator('[data-testid="tag-search-input"]').fill("filter-test-applied");
    await page.locator('[data-testid="create-tag-option"]').click();
    await expect(page.locator('[data-testid="tag-badge-filter-test-applied"]')).toBeVisible({
      timeout: 10000,
    });

    // Re-open combobox and search
    await page.locator('[data-testid="add-tag-button"]').click();
    await page.locator('[data-testid="tag-search-input"]').fill("filter-test");

    // Applied tag should NOT appear in options (already on document)
    await expect(page.locator('[data-testid="tag-option-filter-test-applied"]')).not.toBeVisible({
      timeout: 3000,
    });

    // "Create" option should appear for a new variation
    await expect(page.locator('[data-testid="create-tag-option"]')).toBeVisible();
  });

  // P0-15: Near-duplicate tags handled silently (case normalization)
  test("tag normalization: case-insensitive dedup on creation", async ({ page }) => {
    await navigateToFirstDocument(page);
    await expect(page.locator('[data-testid="document-tag-section"]')).toBeVisible({
      timeout: 15000,
    });

    await page.locator('[data-testid="add-tag-button"]').click();
    await page.locator('[data-testid="tag-search-input"]').fill("Machine Learning");
    await page.locator('[data-testid="create-tag-option"]').click();
    await expect(
      page.locator('[data-tag-source="manual"]', { hasText: /machine learning/i }),
    ).toBeVisible({ timeout: 10000 });

    // Different casing should not create a duplicate
    await page.locator('[data-testid="add-tag-button"]').click();
    await page.locator('[data-testid="tag-search-input"]').fill("machine learning");

    // Tag already applied → excluded from options, and "Create" should not appear
    await expect(page.locator('[data-testid="create-tag-option"]')).not.toBeVisible({
      timeout: 3000,
    });
  });

  // P0-9: Max 20 tags per document enforced
  test("shows limit message when document has 20 tags", async ({ page }) => {
    await navigateToFirstDocument(page);
    await expect(page.locator('[data-testid="document-tag-section"]')).toBeVisible({
      timeout: 15000,
    });

    const existingCount = await page.locator("[data-tag-source]").count();
    const tagsToAdd = 20 - existingCount;

    for (let i = 0; i < tagsToAdd; i++) {
      await page.locator('[data-testid="add-tag-button"]').click();
      await page.locator('[data-testid="tag-search-input"]').fill(`limit-test-tag-${i}`);
      await page.locator('[data-testid="create-tag-option"]').click();
      await expect(page.locator(`[data-testid="tag-badge-limit-test-tag-${i}"]`)).toBeVisible({
        timeout: 10000,
      });
    }

    await expect(page.locator('[data-testid="add-tag-button"]')).not.toBeVisible();
    await expect(page.locator('[data-testid="tag-limit-message"]')).toBeVisible();
    await expect(page.locator('[data-testid="tag-limit-message"]')).toContainText(
      /maximum tags reached/i,
    );
  });

  // P0-14: Empty state — combobox with no matching tags shows only "Create" option
  test("combobox shows only create option when no tags match", async ({ page }) => {
    await navigateToFirstDocument(page);
    await expect(page.locator('[data-testid="document-tag-section"]')).toBeVisible({
      timeout: 15000,
    });

    await page.locator('[data-testid="add-tag-button"]').click();
    await page.locator('[data-testid="tag-search-input"]').fill("completely-unique-no-match-xyz");

    await expect(page.locator('[data-testid="create-tag-option"]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-testid^="tag-option-"]')).not.toBeVisible();
  });

  // Edge case: empty/whitespace-only tag name rejected
  test("empty or whitespace-only tag name does not show create option", async ({ page }) => {
    await navigateToFirstDocument(page);
    await expect(page.locator('[data-testid="document-tag-section"]')).toBeVisible({
      timeout: 15000,
    });

    await page.locator('[data-testid="add-tag-button"]').click();
    await page.locator('[data-testid="tag-search-input"]').fill("   ");

    await expect(page.locator('[data-testid="create-tag-option"]')).not.toBeVisible({
      timeout: 3000,
    });
  });

  // Edge case: tag name > 50 chars rejected (client-side + backend)
  test("tag name exceeding 50 characters shows error and hides create option", async ({ page }) => {
    await navigateToFirstDocument(page);
    await expect(page.locator('[data-testid="document-tag-section"]')).toBeVisible({
      timeout: 15000,
    });

    const longName = "a".repeat(51);
    await page.locator('[data-testid="add-tag-button"]').click();
    await page.locator('[data-testid="tag-search-input"]').fill(longName);

    await expect(page.locator('[data-testid="create-tag-option"]')).not.toBeVisible({
      timeout: 3000,
    });

    await expect(page.locator('[data-testid="tag-name-too-long"]')).toBeVisible();
    await expect(page.locator('[data-testid="tag-name-too-long"]')).toContainText(
      /50 characters or fewer/i,
    );
  });
});

test.describe("Tagging — library filtering (seeded account)", () => {
  test.setTimeout(60000);

  test.afterEach(async ({ page }) => {
    await reseedAccount(page);
  });

  // P0-10: Library page tag filter bar with AND logic, clear-all button
  test("library shows tag filter bar and filters documents by tag", async ({ page }) => {
    await signIn(page, SEEDED_USER.email, SEEDED_USER.password);
    await page.goto("/library");

    await expect(page.locator('[data-testid="tag-filter-bar"]')).toBeVisible({ timeout: 15000 });

    // Use button inside the filter bar to avoid matching the bar itself
    const filterButtons = page.locator(
      '[data-testid="tag-filter-bar"] [data-testid^="tag-filter-"]:not([data-testid="tag-filter-bar"])',
    );
    await expect(filterButtons.first()).toBeVisible({ timeout: 10000 });

    const allDocs = page.locator("a[href^='/library/']");
    const totalCount = await allDocs.count();
    expect(totalCount).toBeGreaterThan(0);

    await filterButtons.first().click();
    await expect(page.locator('[data-testid="clear-tag-filters"]')).toBeVisible();

    const filteredCount = await page.locator("a[href^='/library/']").count();
    expect(filteredCount).toBeLessThanOrEqual(totalCount);

    await page.locator('[data-testid="clear-tag-filters"]').click();
    await expect(page.locator('[data-testid="clear-tag-filters"]')).not.toBeVisible();
    const resetCount = await page.locator("a[href^='/library/']").count();
    expect(resetCount).toBe(totalCount);
  });

  // P0-11: Document cards show max 2 tags + "+N" overflow
  test("library document cards show max 2 tags with overflow indicator", async ({ page }) => {
    await signIn(page, SEEDED_USER.email, SEEDED_USER.password);
    await page.goto("/library");

    const docCard = page.locator("a[href^='/library/']").first();
    await expect(docCard).toBeVisible({ timeout: 10000 });

    // Seeded doc 1 has 3 tags, doc 2 has 3 tags — at least one should show tag-list
    const tagList = docCard.locator('[data-testid="tag-list"]');
    await expect(tagList).toBeVisible({ timeout: 10000 });

    const cardTags = tagList.locator('[data-testid^="tag-badge-"]');
    const visibleTagCount = await cardTags.count();
    expect(visibleTagCount).toBeLessThanOrEqual(2);

    // With 3 tags and maxVisible=2, overflow should show "+1"
    const overflow = tagList.locator('[data-testid="tag-overflow"]');
    await expect(overflow).toBeVisible();
    await expect(overflow).toContainText(/\+\d+/);
  });
});

test.describe("Tagging — feed cards (seeded account)", () => {
  test.setTimeout(60000);

  test.afterEach(async ({ page }) => {
    await reseedAccount(page);
  });

  // P0-12: Feed cards show up to 3 tags from source document + "+N" overflow
  test("feed cards display tag chips from source document", async ({ page }) => {
    await signIn(page, SEEDED_USER.email, SEEDED_USER.password);
    await page.goto("/feed?noAutoGenerate");

    const firstCard = page.locator('[data-testid="post-card"]').first();
    await expect(firstCard).toBeVisible({ timeout: 15000 });

    const tagList = firstCard.locator('[data-testid="tag-list"]');
    await expect(tagList).toBeVisible({ timeout: 10000 });

    const cardTags = tagList.locator('[data-testid^="tag-badge-"]');
    const tagCount = await cardTags.count();
    expect(tagCount).toBeLessThanOrEqual(3);
    expect(tagCount).toBeGreaterThan(0);
  });

  // P0-12: "+N" overflow when more than 3 tags
  test("feed card shows overflow indicator when document has more than 3 tags", async ({
    page,
  }) => {
    await signIn(page, SEEDED_USER.email, SEEDED_USER.password);

    // Add extra tags to the seeded document to ensure > 3 total
    await page.goto("/library");
    const docLink = page.locator("a[href^='/library/']").first();
    await expect(docLink).toBeVisible({ timeout: 10000 });
    await docLink.click();
    await expect(page).toHaveURL(/\/library\/.+/);
    await expect(page.locator('[data-testid="document-tag-section"]')).toBeVisible({
      timeout: 15000,
    });

    // Seed doc 1 has 3 AI tags; add one more to exceed maxVisible=3 on feed
    const currentCount = await page.locator("[data-tag-source]").count();
    const tagsNeeded = Math.max(0, 4 - currentCount);
    for (let i = 0; i < tagsNeeded; i++) {
      await page.locator('[data-testid="add-tag-button"]').click();
      await page.locator('[data-testid="tag-search-input"]').fill(`overflow-feed-${i}`);
      await page.locator('[data-testid="create-tag-option"]').click();
      await expect(page.locator(`[data-testid="tag-badge-overflow-feed-${i}"]`)).toBeVisible({
        timeout: 10000,
      });
    }

    await page.goto("/feed?noAutoGenerate");
    const firstCard = page.locator('[data-testid="post-card"]').first();
    await expect(firstCard).toBeVisible({ timeout: 15000 });

    const tagList = firstCard.locator('[data-testid="tag-list"]');
    await expect(tagList).toBeVisible({ timeout: 10000 });

    const feedTags = tagList.locator('[data-testid^="tag-badge-"]');
    expect(await feedTags.count()).toBeLessThanOrEqual(3);
    await expect(tagList.locator('[data-testid="tag-overflow"]')).toBeVisible();
    await expect(tagList.locator('[data-testid="tag-overflow"]')).toContainText(/\+\d+/);
  });
});

test.describe("Tagging — AI auto-suggest (ephemeral account)", () => {
  test.setTimeout(120000);

  test.beforeEach(async ({ page }) => {
    await signUp(page);
  });

  test.afterEach(async ({ page }) => {
    await cleanupTestData(page);
  });

  // P0-3: AI auto-suggests 3-5 tags when document reaches "ready" status
  test("AI auto-suggests tags after document upload and processing", async ({ page }) => {
    await page.goto("/upload");
    await expect(page.getByRole("heading", { name: /upload content/i })).toBeVisible();
    await page.locator('input[type="file"]').setInputFiles(path.join(FIXTURES_DIR, "test.md"));
    await expect(page.getByText(/uploaded/i)).toBeVisible({ timeout: 30000 });

    await page.goto("/library");
    const docLink = page.locator("a[href^='/library/']").first();
    await expect(docLink).toBeVisible({ timeout: 10000 });
    await docLink.click();
    await expect(page).toHaveURL(/\/library\/.+/);

    // Wait for processing to complete
    await expect(page.getByText(/chunk/i)).toBeVisible({ timeout: 90000 });

    // After processing, AI-suggested tags should appear automatically
    await expect(page.locator('[data-tag-source="ai"]').first()).toBeVisible({ timeout: 30000 });

    const aiTags = page.locator('[data-tag-source="ai"]');
    const count = await aiTags.count();
    expect(count).toBeGreaterThanOrEqual(1);
    expect(count).toBeLessThanOrEqual(5);
  });
});
