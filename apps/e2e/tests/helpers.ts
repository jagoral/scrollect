import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import path from "node:path";

export const FIXTURES_DIR = path.join(__dirname, "..", "fixtures");
export const SEEDED_AUTH_FILE = path.join(__dirname, ".auth", "seeded.json");

export const SEEDED_USER = {
  name: "E2E Seeded",
  email: "e2e-seeded-account@test.scrollect.dev",
  password: "testpassword123",
};

export function testUser() {
  return {
    name: "E2E Tester",
    email: `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.scrollect.dev`,
    password: "testpassword123",
  };
}

export async function ensureSeededAccount() {
  const siteUrl = process.env.VITE_CONVEX_SITE_URL;
  if (!siteUrl) throw new Error("VITE_CONVEX_SITE_URL is not set");

  const res = await fetch(`${siteUrl}/api/auth/sign-up/email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Node's fetch auto-sends Sec-Fetch-* headers, which trips better-auth's
      // CSRF check and requires an Origin. Send the Convex site as Origin —
      // it's already trusted via allowedHosts in the auth config.
      Origin: siteUrl,
    },
    body: JSON.stringify({
      email: SEEDED_USER.email,
      password: SEEDED_USER.password,
      name: SEEDED_USER.name,
    }),
  });

  // 200 = created, 422 = already exists — both are fine.
  // Anything else is a real failure we want to see.
  if (res.ok || res.status === 422) return;
  const body = await res.text();
  throw new Error(`Failed to ensure seeded account: ${res.status} ${body}`);
}

export async function seedTestData(email: string) {
  const { ok, status, body } = await convexE2ERequest("/api/e2e-seed", email);
  if (!ok) {
    throw new Error(`E2E seed failed: ${status} ${body}`);
  }
  return JSON.parse(body);
}

export async function resetTestData(email: string) {
  try {
    const { ok, status, body } = await convexE2ERequest("/api/e2e-reset", email);
    if (!ok) {
      console.warn(`E2E reset failed: ${status} ${body}`);
    }
  } catch (error) {
    console.warn("E2E reset error:", error);
  }
}

export async function seedProSubscription(email: string) {
  const { ok, status, body } = await convexE2ERequest("/api/e2e-seed-pro", email);
  if (!ok) {
    throw new Error(`E2E seed Pro failed: ${status} ${body}`);
  }
}

export async function seedEarlyAdopterGrant(email: string) {
  const { ok, status, body } = await convexE2ERequest("/api/e2e-seed-grant", email);
  if (!ok) {
    throw new Error(`E2E seed grant failed: ${status} ${body}`);
  }
}

export async function cleanupTestData(email: string) {
  try {
    const { ok, status, body } = await convexE2ERequest("/api/e2e-cleanup", email);
    if (!ok) {
      console.warn(`E2E cleanup failed: ${status} ${body}`);
    }
  } catch (error) {
    console.warn("E2E cleanup error:", error);
  }
}

export async function reseedAccount() {
  await cleanupTestData(SEEDED_USER.email);
  await seedTestData(SEEDED_USER.email);
}

export async function dismissCookieConsent(page: Page) {
  const rejectBtn = page.locator("#cc-main .cm__btn[data-role='necessary']");
  if (await rejectBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await rejectBtn.click();
  }
}

export async function skipLearningGoalPrompt(page: Page) {
  const dialog = page.getByRole("dialog", { name: /what do you want to learn from this/i });
  if (!(await dialog.isVisible({ timeout: 5000 }).catch(() => false))) return;
  await dialog.getByRole("button", { name: /skip for now/i }).click();
  await expect(dialog).toBeHidden({ timeout: 10000 });
}

export async function signUp(page: Page): Promise<{ email: string }> {
  const user = testUser();
  await page.goto("/signin");
  await page.waitForLoadState("networkidle");
  await dismissCookieConsent(page);
  await page.getByRole("button", { name: /sign up/i }).click();
  await page.getByLabel("Name").fill(user.name);
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: /create account/i }).click();
  await page.waitForURL(/\/(library|feed)/, { timeout: 30000 });
  return { email: user.email };
}

export async function signIn(page: Page, email: string, password: string) {
  await page.goto("/signin");
  await page.waitForLoadState("networkidle");
  await dismissCookieConsent(page);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page
    .getByRole("main")
    .getByRole("button", { name: /sign in$/i })
    .click();
  await page.waitForURL(/\/(library|feed)/, { timeout: 15000 });
}

export async function signInToSeededFeed(page: Page) {
  await page.goto("/app/feed?noAutoGenerate");
  await page.waitForLoadState("networkidle");
  await expect(page.locator('[data-testid="post-card"]').first()).toBeVisible();
}

export async function goToFirstDocument(page: Page) {
  await page.goto("/app/library");
  await page.waitForLoadState("networkidle");
  const docButton = page.locator('[data-testid="document-item"]').first();
  await expect(docButton).toBeVisible({ timeout: 15000 });
  await docButton.click();
  await expect(page.locator('[data-testid="status-ready"]').first()).toBeVisible({
    timeout: 15000,
  });
}

export type DrainedAnalyticsEvent = {
  event: string;
  properties: Record<string, unknown>;
  createdAt: number;
};

/**
 * Drains the E2E analytics buffer for a given user. Events are consumed on
 * read, so a drain before and after a user action yields only the events
 * emitted during that action. Backed by the `e2eAnalyticsEvents` Convex table
 * (see ADR-018 Task 6 + `/api/e2e-analytics-drain` HTTP route).
 */
export async function drainAnalyticsEvents(email: string): Promise<DrainedAnalyticsEvent[]> {
  const { ok, status, body } = await convexE2ERequest("/api/e2e-analytics-drain", email);
  if (!ok) {
    throw new Error(`E2E analytics drain failed: ${status} ${body}`);
  }
  return (JSON.parse(body).events ?? []) as DrainedAnalyticsEvent[];
}

/**
 * Polls the E2E endpoint that counts documents with a `learningGoalEmbedding`. Used
 * after `updateLearningGoal` to wait for the scheduled embed action to complete before
 * asserting analytics — the mutation returns instantly with an empty embedding column
 * and the action populates it asynchronously.
 */
export async function waitForGoalEmbedding(
  email: string,
  opts: { minCount?: number; timeoutMs?: number; intervalMs?: number } = {},
): Promise<number> {
  const minCount = opts.minCount ?? 1;
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const intervalMs = opts.intervalMs ?? 250;
  const deadline = Date.now() + timeoutMs;
  let lastCount = 0;
  while (Date.now() < deadline) {
    const { ok, status, body } = await convexE2ERequest("/api/e2e-goal-embedding-count", email);
    if (!ok) throw new Error(`E2E goal embedding count failed: ${status} ${body}`);
    lastCount = (JSON.parse(body).count ?? 0) as number;
    if (lastCount >= minCount) return lastCount;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(
    `Timed out waiting for ${minCount} document(s) with a learning-goal embedding; ` +
      `last count was ${lastCount}.`,
  );
}

/**
 * Polls the analytics drain until the predicate matches or the timeout elapses.
 * Events accumulate across drain cycles so the caller sees the full set once the
 * predicate succeeds.
 *
 * `captureServingAnalytics` is scheduled via `ctx.scheduler.runAfter(0, ...)` — it
 * runs AFTER the serve mutation returns, so a single drain immediately after the
 * serve button re-enables can miss the events. Polling closes that race.
 */
export async function waitForAnalyticsEvents(
  email: string,
  opts: {
    predicate: (events: DrainedAnalyticsEvent[]) => boolean;
    timeoutMs?: number;
    intervalMs?: number;
  },
): Promise<DrainedAnalyticsEvent[]> {
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const intervalMs = opts.intervalMs ?? 250;
  const deadline = Date.now() + timeoutMs;
  const accumulated: DrainedAnalyticsEvent[] = [];

  while (Date.now() < deadline) {
    const batch = await drainAnalyticsEvents(email);
    accumulated.push(...batch);
    if (opts.predicate(accumulated)) return accumulated;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return accumulated;
}

export async function fetchConnectionDrafts(email: string) {
  const { ok, status, body } = await convexE2ERequest("/api/e2e-connection-drafts", email);
  if (!ok) {
    throw new Error(`E2E connection drafts query failed: ${status} ${body}`);
  }
  return JSON.parse(body).drafts as Array<{
    _id: string;
    documentId: string;
    cardType: string;
    strategy: string;
    sourceChunkIds: string[];
    typeData: {
      type: string;
      connectionType?: string;
      sourceATitleHint?: string;
      sourceBTitleHint?: string;
    };
    content: string;
  }>;
}

async function convexE2ERequest(
  urlPath: string,
  email: string,
): Promise<{ ok: boolean; status: number; body: string }> {
  const siteUrl = process.env.VITE_CONVEX_SITE_URL;
  if (!siteUrl) {
    throw new Error("VITE_CONVEX_SITE_URL is not set");
  }

  const res = await fetch(`${siteUrl}${urlPath}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });

  const body = await res.text();
  return { ok: res.ok, status: res.status, body };
}
