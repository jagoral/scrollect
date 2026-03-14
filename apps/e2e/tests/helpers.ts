import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import path from "node:path";

export const FIXTURES_DIR = path.join(__dirname, "..", "fixtures");

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
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: SEEDED_USER.email,
      password: SEEDED_USER.password,
      name: SEEDED_USER.name,
    }),
  });

  // 200 = created, 4xx = already exists — both are fine
  if (!res.ok && res.status >= 500) {
    const body = await res.text();
    throw new Error(`Failed to ensure seeded account: ${res.status} ${body}`);
  }
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

export async function signUp(page: Page): Promise<{ email: string }> {
  const user = testUser();
  await page.goto("/signin");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: /sign up/i }).click();
  await page.getByLabel("Name").fill(user.name);
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: /create account/i }).click();
  await expect(page).toHaveURL(/\/library/, { timeout: 15000 });
  return { email: user.email };
}

export async function signIn(page: Page, email: string, password: string) {
  await page.goto("/signin");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page
    .getByRole("main")
    .getByRole("button", { name: /sign in$/i })
    .click();
  await page.waitForURL(/\/(library|feed)/, { timeout: 15000 });
}

export async function signInToSeededFeed(page: Page) {
  await signIn(page, SEEDED_USER.email, SEEDED_USER.password);
  await page.goto("/feed?noAutoGenerate");
  await page.waitForLoadState("networkidle");
  await expect(page.locator('[data-testid="post-card"]').first()).toBeVisible();
}

export async function goToFirstDocument(page: Page) {
  await page.goto("/library");
  await page.waitForLoadState("networkidle");
  const docLink = page.locator("a[href^='/library/']").first();
  await expect(docLink).toBeVisible({ timeout: 10000 });
  const href = await docLink.getAttribute("href");
  await page.goto(href!);
  await page.waitForLoadState("networkidle");
  await expect(page).toHaveURL(/\/library\/.+/);
  await expect(page.getByText(/back to library/i)).toBeVisible();
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
