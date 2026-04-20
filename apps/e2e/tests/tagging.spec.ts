import { test, expect } from "@playwright/test";

import { goToFirstDocument, reseedAccount } from "./helpers";

test.describe("Tagging — document detail: AI tags (seeded account)", { tag: "@seeded" }, () => {
  test.setTimeout(60000);

  test.beforeEach(async () => {
    // Reseed BEFORE the test so the Convex client connects after data is already
    // in the database. This avoids a race where the client subscribes, receives
    // the cleanup (empty state), and the tag queries resolve with [] before the
    // seed data arrives.
    await reseedAccount();
  });

  test.afterEach(async () => {
    await reseedAccount();
  });

  // P0-5: Ready documents show tag chips with AI indicator for AI-sourced tags
  test("document detail page shows AI-suggested tags with sparkle indicator", async ({ page }) => {
    await goToFirstDocument(page);

    // Wait directly for AI tags (combines tag section load + AI tag visibility
    // into one assertion so we don't "lock in" an intermediate empty state)
    const aiTag = page
      .locator('[data-testid="document-tag-section"] [data-tag-source="ai"]')
      .first();
    await expect(aiTag).toBeVisible({ timeout: 30000 });
  });

  // AI vs manual visual distinction
  test("AI-suggested and manual tags are visually distinguishable", async ({ page }) => {
    await goToFirstDocument(page);

    // Wait directly for AI tags within the tag section
    const aiTags = page.locator('[data-testid="document-tag-section"] [data-tag-source="ai"]');
    await expect(aiTags.first()).toBeVisible({ timeout: 30000 });

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

test.describe(
  "Tagging — document detail: manual operations (seeded account)",
  { tag: "@seeded" },
  () => {
    test.setTimeout(60000);

    test.afterEach(async () => {
      await reseedAccount();
    });

    // P0-7: Combobox "Create '{name}'" option creates new tag and applies it
    test("user can create a new tag via combobox", async ({ page }) => {
      await goToFirstDocument(page);
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
      await goToFirstDocument(page);
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

      // Click the second document in the library list (panel switches document
      // via client-side state, preserving the Convex WebSocket connection)
      const docButtons = page.locator('[data-testid="document-item"]');
      await expect(docButtons.first()).toBeVisible({ timeout: 10000 });
      const count = await docButtons.count();
      expect(count).toBeGreaterThan(1);
      await docButtons.nth(1).click();
      await expect(page.locator('[data-testid="document-tag-section"]')).toBeVisible({
        timeout: 15000,
      });

      // Open combobox and search for the tag we created on doc 1.
      await page.locator('[data-testid="add-tag-button"]').click();
      await expect(page.locator('[data-testid="tag-option-existing-tag-test"]')).toBeVisible({
        timeout: 10000,
      });
      await page.locator('[data-testid="tag-search-input"]').fill("existing-tag-test");
      await expect(page.locator('[data-testid="tag-option-existing-tag-test"]')).toBeVisible({
        timeout: 5000,
      });
      await page.locator('[data-testid="tag-option-existing-tag-test"]').click();
      await expect(
        page
          .locator('[data-testid="document-tag-section"]')
          .locator('[data-testid="tag-badge-existing-tag-test"][data-tag-source="manual"]'),
      ).toBeVisible({ timeout: 10000 });
    });

    // P0-8: "x" on chip removes tag-document association (tag itself persists for reuse)
    test("user can remove a tag via the x button and tag persists for reuse", async ({ page }) => {
      await goToFirstDocument(page);
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

      // Remove it - the client detects optimistic IDs and falls back to name-based removal
      await page.locator('[data-testid="tag-remove-removable-tag"]').click();
      await expect(page.locator('[data-testid="tag-badge-removable-tag"]')).not.toBeVisible({
        timeout: 10000,
      });

      // Tag should persist for reuse - reopen the combobox and search.
      await page.locator('[data-testid="add-tag-button"]').click();
      const searchInput = page.locator('[data-testid="tag-search-input"]');
      await expect(searchInput).toBeVisible({ timeout: 5000 });
      await searchInput.fill("removable-tag");

      // The tag should appear as an existing option (not "Create" since it exists)
      await expect(page.locator('[data-testid="tag-option-removable-tag"]')).toBeVisible({
        timeout: 15000,
      });
    });

    // P0-13: Tag combobox autocomplete filters in real-time, excludes already-applied tags
    test("combobox autocomplete filters in real-time and excludes applied tags", async ({
      page,
    }) => {
      await goToFirstDocument(page);
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
      await goToFirstDocument(page);
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
      await goToFirstDocument(page);
      const tagSection = page.locator('[data-testid="document-tag-section"]');
      await expect(tagSection).toBeVisible({
        timeout: 15000,
      });

      const existingCount = await tagSection.locator("[data-tag-source]").count();
      const tagsToAdd = 20 - existingCount;

      for (let i = 0; i < tagsToAdd; i++) {
        await page.locator('[data-testid="add-tag-button"]').click();
        await page.locator('[data-testid="tag-search-input"]').fill(`limit-test-tag-${i}`);
        await page.locator('[data-testid="create-tag-option"]').click();
        await expect(page.locator(`[data-testid="tag-badge-limit-test-tag-${i}"]`)).toBeVisible({
          timeout: 10000,
        });
        // Wait for the popover to close before the next iteration — Convex subscription
        // updates can re-render the combobox mid-interaction, detaching DOM elements
        await expect(page.locator('[data-testid="tag-search-input"]')).not.toBeVisible();
      }

      await expect(page.locator('[data-testid="add-tag-button"]')).not.toBeVisible();
      await expect(page.locator('[data-testid="tag-limit-message"]')).toBeVisible();
      await expect(page.locator('[data-testid="tag-limit-message"]')).toContainText(
        /maximum tags reached/i,
      );
    });

    // P0-14: Empty state — combobox with no matching tags shows only "Create" option
    test("combobox shows only create option when no tags match", async ({ page }) => {
      await goToFirstDocument(page);
      await expect(page.locator('[data-testid="document-tag-section"]')).toBeVisible({
        timeout: 15000,
      });

      await page.locator('[data-testid="add-tag-button"]').click();
      await page.locator('[data-testid="tag-search-input"]').fill("completely-unique-no-match-xyz");

      await expect(page.locator('[data-testid="create-tag-option"]')).toBeVisible({
        timeout: 5000,
      });
      await expect(page.locator('[data-testid^="tag-option-"]')).not.toBeVisible();
    });

    // Edge case: empty/whitespace-only tag name rejected
    test("empty or whitespace-only tag name does not show create option", async ({ page }) => {
      await goToFirstDocument(page);
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
    test("tag name exceeding 50 characters shows error and hides create option", async ({
      page,
    }) => {
      await goToFirstDocument(page);
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
  },
);

test.describe("Tagging — library filtering (seeded account)", { tag: "@seeded" }, () => {
  test.setTimeout(60000);

  test.afterEach(async () => {
    await reseedAccount();
  });

  // P0-10: Library page tag filter bar with AND logic, clear-all button
  test("library shows tag filter bar and filters documents by tag", async ({ page }) => {
    await page.goto("/app/library");
    await page.waitForLoadState("networkidle");

    await expect(page.locator('[data-testid="tag-filter-bar"]')).toBeVisible();

    // Use button inside the filter bar to avoid matching the bar itself
    const filterButtons = page.locator(
      '[data-testid="tag-filter-bar"] [data-testid^="tag-filter-"]:not([data-testid="tag-filter-bar"])',
    );
    await expect(filterButtons.first()).toBeVisible({ timeout: 10000 });

    const allDocs = page.locator('[data-testid="document-item"]');
    const totalCount = await allDocs.count();
    expect(totalCount).toBeGreaterThan(0);

    await filterButtons.first().click();
    await expect(page.locator('[data-testid="clear-tag-filters"]')).toBeVisible();

    const filteredCount = await page.locator('[data-testid="document-item"]').count();
    expect(filteredCount).toBeLessThanOrEqual(totalCount);

    await page.locator('[data-testid="clear-tag-filters"]').click();
    await expect(page.locator('[data-testid="clear-tag-filters"]')).not.toBeVisible();
    const resetCount = await page.locator('[data-testid="document-item"]').count();
    expect(resetCount).toBe(totalCount);
  });

  // P0-11: Document cards show a capped tag list with overflow indicator when needed
  test("library document cards cap visible tags at maxVisible with overflow indicator", async ({
    page,
  }) => {
    await page.goto("/app/library");
    await page.waitForLoadState("networkidle");

    const docCard = page.locator('[data-testid="document-item"]').first();
    await expect(docCard).toBeVisible({ timeout: 10000 });

    const tagList = docCard.locator('[data-testid="tag-list"]');
    await expect(tagList).toBeVisible({ timeout: 10000 });

    const cardTags = tagList.locator('[data-testid^="tag-badge-"]');
    const visibleTagCount = await cardTags.count();
    expect(visibleTagCount).toBeLessThanOrEqual(3);
    expect(visibleTagCount).toBeGreaterThan(0);

    // Overflow indicator only renders when the source document has more tags
    // than the list's maxVisible cap. Accept either state.
    const overflow = tagList.locator('[data-testid="tag-overflow"]');
    if ((await overflow.count()) > 0) {
      await expect(overflow).toContainText(/\+\d+/);
    }
  });
});

test.describe("Tagging — feed cards (seeded account)", { tag: "@seeded" }, () => {
  test.setTimeout(60000);

  test.afterEach(async () => {
    await reseedAccount();
  });

  // P0-12: Feed cards show up to 3 tags from source document + "+N" overflow
  test("feed cards display tag chips from source document", async ({ page }) => {
    await page.goto("/app/feed?noAutoGenerate");
    await page.waitForLoadState("networkidle");

    const firstCard = page.locator('[data-testid="post-card"]').first();
    await expect(firstCard).toBeVisible();

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
    // Add extra tags to the seeded document to ensure > 3 total
    await page.goto("/app/library");
    await page.waitForLoadState("networkidle");
    const docButton = page.locator('[data-testid="document-item"]').first();
    await expect(docButton).toBeVisible({ timeout: 10000 });
    await docButton.click();
    await expect(page.locator('[data-testid="document-tag-section"]')).toBeVisible({
      timeout: 15000,
    });

    // Ensure this document has > 3 tags to exceed maxVisible=3 on feed cards
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

    await page.goto("/app/feed?noAutoGenerate");
    await page.waitForLoadState("networkidle");

    // Find a feed card sourced from the document we tagged (not necessarily the first card)
    const overflowIndicator = page.locator('[data-testid="tag-overflow"]');
    await expect(overflowIndicator.first()).toBeVisible({ timeout: 10000 });

    // Verify the overflow card has at most 3 visible badges and a "+N" label
    const overflowCard = page
      .locator('[data-testid="post-card"]')
      .filter({
        has: page.locator('[data-testid="tag-overflow"]'),
      })
      .first();
    const tagList = overflowCard.locator('[data-testid="tag-list"]');
    const feedTags = tagList.locator('[data-testid^="tag-badge-"]');
    expect(await feedTags.count()).toBeLessThanOrEqual(3);
    await expect(tagList.locator('[data-testid="tag-overflow"]')).toContainText(/\+\d+/);
  });
});

test.describe("Tagging — AI auto-suggest count (seeded account)", { tag: "@seeded" }, () => {
  test.setTimeout(60000);

  test.beforeEach(async () => {
    await reseedAccount();
  });

  test.afterEach(async () => {
    await reseedAccount();
  });

  // P0-3: AI auto-suggests 1-5 tags per document
  test("ready document has 1-5 AI-suggested tags", async ({ page }) => {
    await goToFirstDocument(page);

    const aiTags = page.locator('[data-testid="document-tag-section"] [data-tag-source="ai"]');
    await expect(aiTags.first()).toBeVisible({ timeout: 15000 });

    const count = await aiTags.count();
    expect(count).toBeGreaterThanOrEqual(1);
    expect(count).toBeLessThanOrEqual(5);
  });
});
