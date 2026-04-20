import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import {
  SEEDED_USER,
  drainAnalyticsEvents,
  reseedAccount,
  waitForAnalyticsEvents,
  waitForGoalEmbedding,
} from "./helpers";
import type { DrainedAnalyticsEvent } from "./helpers";

/**
 * Task 8 of issue #216 / ADR-018.
 *
 * Scope: behavior verification for the serving-time feed scorer. Semantic
 * ranking quality is covered by the eval harness in
 * `packages/backend/evals/feedServing.eval.ts` - this spec only checks that
 * the serving mutation runs end-to-end and emits the four analytics events
 * defined in ADR-018 §7.
 *
 * Analytics assertions read from the E2E-only Convex buffer via
 * `POST /api/e2e-analytics-drain` (Task 6). Events are consumed on read.
 *
 * First-session gating: `feed.first_session_book_depth_reach` and
 * `feed.first_session_post_type_mix` fire only when a document has
 * `createdAt` within 24h AND its drafts had `servedCount == 0` before the
 * batch. The seeded account pre-populates `servedCount: 1` to keep the
 * seeded feed stable across runs, so those two events do not fire here.
 * Backend covers them at the unit-test layer (284 tests green per Task 6).
 * The two batch-level events below fire on every serve and are sufficient
 * E2E coverage that the analytics wiring is live.
 *
 * Running: dev server must be up (`bun turbo dev --filter "@scrollect/web"`).
 */

const LEARNING_GOAL = "Understand distributed systems tradeoffs and practical techniques";
const CARD = '[data-testid="post-card"]';
const SERVE_BUTTON = '[data-testid="feed-serve-button"]';

test.describe("Feed: best cards first (issue #216)", { tag: "@seeded" }, () => {
  test.setTimeout(60_000);

  test.beforeEach(async () => {
    await reseedAccount();
  });

  test.afterEach(async () => {
    await reseedAccount();
  });

  test("serves a feed batch for a seeded user with a learning goal", async ({ page }) => {
    await setLearningGoal(page, LEARNING_GOAL);
    // `updateLearningGoal` schedules the embedding action via `runAfter(0)`. Wait for
    // it to populate at least one document before serving so goal-relevance analytics
    // are deterministic.
    await waitForGoalEmbedding(SEEDED_USER.email, { minCount: 1 });

    await page.goto("/app/feed?noAutoServe");
    const cards = page.locator(CARD);
    await expect(cards.first()).toBeVisible({ timeout: 15_000 });
    const initialCount = await cards.count();

    // Drain any events emitted by page load + learning-goal save so our
    // post-serve drain only contains serve-triggered events.
    await drainAnalyticsEvents(SEEDED_USER.email);

    const serveButton = page.locator(SERVE_BUTTON);
    await expect(serveButton).toBeVisible();
    await serveButton.click();

    // Serve mutation completes when the spinner clears. `feed.posts_served`
    // is emitted by `captureServingAnalytics` at the tail of the mutation -
    // we drain once it's visible so assertions see serve-only events.
    await expect(serveButton).not.toBeDisabled({ timeout: 15_000 });
    const finalCount = await cards.count();
    expect(finalCount).toBeGreaterThanOrEqual(initialCount);

    const events = await waitForAnalyticsEvents(SEEDED_USER.email, {
      predicate: (all) =>
        all.some((e) => e.event === "feed.serving_quality_score_distribution") &&
        all.some((e) => e.event === "feed.learning_goal_relevance_applied"),
    });
    expect(events, "serve should emit at least feed.posts_served").not.toHaveLength(0);

    const qualityEvent = findEvent(events, "feed.serving_quality_score_distribution");
    expect(qualityEvent, "quality distribution event must fire per batch").toBeDefined();
    assertQualityDistributionShape(qualityEvent!);

    const goalEvent = findEvent(events, "feed.learning_goal_relevance_applied");
    expect(goalEvent, "goal relevance event must fire per batch").toBeDefined();
    assertGoalRelevanceShape(goalEvent!, { expectedApplied: true });
  });

  test("feed renders cards when learning goal is cleared", async ({ page }) => {
    await setLearningGoal(page, "");

    await page.goto("/app/feed?noAutoServe");
    const cards = page.locator(CARD);
    await expect(cards.first()).toBeVisible({ timeout: 15_000 });

    await drainAnalyticsEvents(SEEDED_USER.email);

    const serveButton = page.locator(SERVE_BUTTON);
    await serveButton.click();
    await expect(serveButton).not.toBeDisabled({ timeout: 15_000 });

    const count = await cards.count();
    expect(count).toBeGreaterThan(0);

    const events = await waitForAnalyticsEvents(SEEDED_USER.email, {
      predicate: (all) => all.some((e) => e.event === "feed.learning_goal_relevance_applied"),
    });
    const goalEvent = findEvent(events, "feed.learning_goal_relevance_applied");
    expect(
      goalEvent,
      "goal relevance event must still fire when goal is cleared (applied=false)",
    ).toBeDefined();
    assertGoalRelevanceShape(goalEvent!, { expectedApplied: false });
  });
});

function findEvent(
  events: DrainedAnalyticsEvent[],
  name: string,
): DrainedAnalyticsEvent | undefined {
  return events.find((e) => e.event === name);
}

function assertQualityDistributionShape(event: DrainedAnalyticsEvent) {
  const props = event.properties;
  expect(typeof props.total_posts, "total_posts is number").toBe("number");
  expect(props.total_posts as number).toBeGreaterThan(0);

  expect(typeof props.mean, "mean is number").toBe("number");
  const mean = props.mean as number;
  expect(mean).toBeGreaterThanOrEqual(0);
  expect(mean).toBeLessThanOrEqual(1);

  expect(typeof props.std, "std is number").toBe("number");
  expect(props.std as number).toBeGreaterThanOrEqual(0);

  expect(typeof props.below_threshold_0_7_share, "below_threshold_0_7_share is number").toBe(
    "number",
  );
  const below = props.below_threshold_0_7_share as number;
  expect(below).toBeGreaterThanOrEqual(0);
  expect(below).toBeLessThanOrEqual(1);

  expect(props.buckets && typeof props.buckets === "object", "buckets is an object histogram").toBe(
    true,
  );
}

function assertGoalRelevanceShape(
  event: DrainedAnalyticsEvent,
  opts: { expectedApplied: boolean },
) {
  const props = event.properties;
  expect(typeof props.applied, "applied is boolean").toBe("boolean");
  expect(props.applied, "applied matches goal state").toBe(opts.expectedApplied);

  expect(typeof props.section_embedding_coverage_percent, "coverage percent is number").toBe(
    "number",
  );
  const coverage = props.section_embedding_coverage_percent as number;
  expect(coverage).toBeGreaterThanOrEqual(0);
  expect(coverage).toBeLessThanOrEqual(100);

  expect(typeof props.mean_relevance_boost, "mean_relevance_boost is number").toBe("number");
  const boost = props.mean_relevance_boost as number;
  expect(boost).toBeGreaterThanOrEqual(0);

  expect(typeof props.boosted_post_count, "boosted_post_count is number").toBe("number");
  expect(props.boosted_post_count as number).toBeGreaterThanOrEqual(0);

  if (!opts.expectedApplied) {
    // When the goal is cleared the scorer short-circuits to no-op, so no
    // cards can be boosted. This is the cheap signal that the applied-gate
    // is wired correctly end-to-end.
    expect(props.boosted_post_count as number).toBe(0);
  }
}

async function setLearningGoal(page: Page, goal: string) {
  await page.goto("/app/library");
  await page.waitForLoadState("networkidle");
  const docButton = page.locator('[data-testid="document-item"]').first();
  await expect(docButton).toBeVisible({ timeout: 15_000 });
  await docButton.click();

  const textarea = page.locator('[data-testid="learning-goal-textarea"]');
  await expect(textarea).toBeVisible({ timeout: 15_000 });
  const currentValue = ((await textarea.inputValue()) ?? "").trim();
  const nextValue = goal.trim();

  // The form's `persistGoal` short-circuits when the trimmed value matches the
  // last saved value, so no toast fires when the target state already matches.
  // Seeded documents start with no goal, so asserting "Learning goal cleared"
  // on an already-empty textarea would hang indefinitely.
  if (currentValue === nextValue) return;

  await textarea.fill(goal);
  await textarea.blur();

  const confirmation = goal === "" ? "Learning goal cleared" : "Learning goal saved";
  await expect(page.getByText(confirmation)).toBeVisible({ timeout: 10_000 });
}
