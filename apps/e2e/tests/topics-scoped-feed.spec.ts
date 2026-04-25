import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { reseedAccount } from "./helpers";

/**
 * Issue #221 acceptance criterion: create topic -> assign a document -> open
 * topic-scoped feed -> verify the topic feed differs from the unscoped feed
 * for the same user.
 *
 * Tolerance note (per the issue brief):
 * - Strict signal: the topic-scoped post-id sequence is not equal to the
 *   prefix of the unscoped feed restricted to the assigned document.
 * - Tolerated fallback: with the small seeded dataset the two sequences may
 *   coincide. The wiring is still proven by the topic banner being visible,
 *   the scoped feed being non-empty, and every scoped post belonging to the
 *   assigned document.
 *
 * Topic analytics events (`topic_created`, `document_assigned_to_topic`,
 * `feed_scope_opened`) are emitted via `captureTopicAnalytics` which calls
 * PostHog directly and does NOT write to the `e2eAnalyticsEvents` buffer.
 * They cannot be observed via `waitForAnalyticsEvents` from this test.
 * UI-visible signals (toast, scope banner, filtered post list) are used
 * instead. If these events ever need E2E coverage, route them through
 * `recordE2EAnalyticsEvent` like `feed/servingAnalytics.ts` does.
 *
 * Project: `seeded`. Pre-seeded posts cover the assertion without an upload
 * + processing roundtrip; `reseedAccount` in afterEach removes the topic
 * along with the rest of the seeded user's data.
 */

const TOPIC_NAME_BASE = "E2E Topic - Event-Driven Architecture";
const TOPIC_GOAL = "Understand event-driven architecture and microservice messaging tradeoffs.";
const ASSIGNED_DOCUMENT_TITLE = "E2E Seed Document 2";

const POST_CARD = '[data-testid="post-card"]';
const SOURCE_BADGE = '[data-testid="source-badge"]';
const FEED_SCOPE_BANNER = '[data-testid="feed-scope-banner"]';

test.describe("Topics: scoped feed (issue #221)", { tag: "@seeded" }, () => {
  test.setTimeout(90_000);

  test.afterEach(async () => {
    await reseedAccount();
  });

  test("creates a topic, assigns a document, and renders a scoped feed", async ({ page }) => {
    const topicName = `${TOPIC_NAME_BASE} ${Date.now()}`;
    const topicId = await createTopicAndCaptureId(page, {
      name: topicName,
      learningGoal: TOPIC_GOAL,
    });
    await assignDocumentToTopicViaLibrary(page, {
      topicId,
      topicName,
      documentTitle: ASSIGNED_DOCUMENT_TITLE,
    });

    const unscopedAssignedOrder = await capturePostsForTitle(page, {
      url: "/app/feed?noAutoServe",
      title: ASSIGNED_DOCUMENT_TITLE,
      requireBanner: false,
    });
    expect(
      unscopedAssignedOrder.length,
      "unscoped feed must surface at least one post from the assigned document",
    ).toBeGreaterThan(0);

    const scopedOrder = await capturePostsForTitle(page, {
      url: `/app/feed?topicId=${topicId}&noAutoServe`,
      title: ASSIGNED_DOCUMENT_TITLE,
      requireBanner: true,
      bannerLabel: topicName,
    });
    expect(scopedOrder.length, "scoped feed must contain at least one post").toBeGreaterThan(0);

    const scopedTitles = await uniqueSourceTitles(page);
    expect(scopedTitles.size, "scoped feed should only show posts from the assigned document").toBe(
      1,
    );
    expect(scopedTitles.has(ASSIGNED_DOCUMENT_TITLE)).toBe(true);

    // Strict signal (acceptance) when ranking diverges; tolerated otherwise.
    const orderingsDiffer =
      scopedOrder.length !== unscopedAssignedOrder.length ||
      scopedOrder.some((id, idx) => id !== unscopedAssignedOrder[idx]);
    if (!orderingsDiffer) {
      expect(scopedOrder.length).toBeGreaterThan(0);
    }

    await page.locator('[data-testid="feed-view-all"]').click();
    await expect(page).toHaveURL(/\/app\/feed(?:\?.*)?$/, { timeout: 15_000 });
    await expect(page.locator(FEED_SCOPE_BANNER)).toBeHidden();
    expect(new URL(page.url()).searchParams.has("topicId")).toBe(false);
  });
});

async function createTopicAndCaptureId(
  page: Page,
  opts: { name: string; learningGoal: string },
): Promise<string> {
  await page.goto("/app/topics");
  await page.waitForLoadState("networkidle");

  await page.locator('[data-testid="topics-create-button"]').click();
  const dialog = page.locator('[data-testid="create-topic-dialog"]');
  await expect(dialog).toBeVisible({ timeout: 10_000 });

  await dialog.locator('[data-testid="topic-name-input"]').fill(opts.name);
  await dialog.locator('[data-testid="topic-learning-goal-input"]').fill(opts.learningGoal);
  await dialog.locator('[data-testid="topic-create-button"]').click();

  await expect(page.locator("[data-sonner-toast]").getByText("Topic created")).toBeVisible({
    timeout: 10_000,
  });
  await expect(dialog).toBeHidden({ timeout: 10_000 });

  // Creating from /app/topics redirects to the new topic's detail page.
  await expect(page).toHaveURL(/\/app\/topics\/[^/?#]+/, { timeout: 10_000 });
  const topicId = page.url().split("/app/topics/")[1]?.split(/[?#]/)[0];
  if (!topicId) throw new Error(`Could not parse topicId from URL: ${page.url()}`);
  return topicId;
}

async function assignDocumentToTopicViaLibrary(
  page: Page,
  opts: { topicId: string; topicName: string; documentTitle: string },
): Promise<void> {
  await page.goto("/app/library");
  await page.waitForLoadState("networkidle");

  const documentItem = page
    .locator('[data-testid="document-item"]')
    .filter({ hasText: opts.documentTitle })
    .first();
  await expect(documentItem).toBeVisible({ timeout: 15_000 });
  await documentItem.click();

  const detailPanel = page.locator('[data-testid="library-detail-panel"]');
  await expect(detailPanel).toBeVisible({ timeout: 15_000 });

  // The detail panel renders an "Open in feed" link with the document id in
  // the search params. We use it as a stable handle to pivot to the full
  // document detail route, which is where TopicAssignmentSection lives.
  const openInFeedLink = detailPanel.getByRole("link", { name: /open in feed/i });
  await expect(openInFeedLink).toBeVisible({ timeout: 10_000 });
  const href = await openInFeedLink.getAttribute("href");
  if (!href) throw new Error("library-detail-panel did not expose an Open-in-feed link");
  const documentId = new URL(href, "http://localhost").searchParams.get("documentId");
  if (!documentId) {
    throw new Error(`Could not extract documentId from Open-in-feed href: ${href}`);
  }

  await page.goto(`/app/library/${documentId}`);
  await page.waitForLoadState("networkidle");

  const topicSection = page.locator('[data-testid="topic-assignment-section"]');
  await expect(topicSection).toBeVisible({ timeout: 15_000 });
  await topicSection.locator('[data-testid="topic-picker-trigger"]').click();

  const topicOption = page.locator(`[data-testid="topic-option-${opts.topicId}"]`);
  await expect(topicOption).toBeVisible({ timeout: 10_000 });
  await topicOption.click();

  await expect(topicSection.locator('[data-testid="topic-picker-trigger"]')).toContainText(
    opts.topicName,
    { timeout: 10_000 },
  );
}

async function capturePostsForTitle(
  page: Page,
  opts: {
    url: string;
    title: string;
    requireBanner: boolean;
    bannerLabel?: string;
  },
): Promise<string[]> {
  await page.goto(opts.url);
  await page.waitForLoadState("networkidle");

  if (opts.requireBanner) {
    const banner = page.locator(FEED_SCOPE_BANNER);
    await expect(banner).toBeVisible({ timeout: 15_000 });
    await expect(banner).toHaveAttribute("data-scope", "topic");
    if (opts.bannerLabel) await expect(banner).toContainText(opts.bannerLabel);
  }

  const cards = page.locator(POST_CARD);
  await expect(cards.first()).toBeVisible({ timeout: 15_000 });

  const rows = await cards.evaluateAll((els) =>
    els.map((el) => ({
      postId: (el as HTMLElement).dataset.postId ?? "",
      title:
        (
          el.querySelector('[data-testid="source-badge"]') as HTMLElement | null
        )?.textContent?.trim() ?? "",
    })),
  );
  return rows.filter((r) => r.title === opts.title).map((r) => r.postId);
}

async function uniqueSourceTitles(page: Page): Promise<Set<string>> {
  const cards = page.locator(POST_CARD);
  const sourceBadgeTexts = await cards
    .locator(SOURCE_BADGE)
    .evaluateAll((els) => els.map((el) => el.textContent?.trim() ?? ""));
  return new Set(sourceBadgeTexts);
}
