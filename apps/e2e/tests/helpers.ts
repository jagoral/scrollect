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

export async function signUp(page: Page) {
  const user = testUser();
  await page.goto("/signin");
  await page.getByRole("button", { name: /sign up/i }).click();
  await page.getByLabel("Name").fill(user.name);
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: /create account/i }).click();
  await expect(page).toHaveURL(/\/library/, { timeout: 15000 });
}

export async function signIn(page: Page, email: string, password: string) {
  await page.goto("/signin");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /sign in$/i }).click();
  await page.waitForURL(/\/(library|feed)/, { timeout: 15000 });
}

export async function seedTestData(page: Page) {
  const response = await page.request.post("/api/e2e-seed");
  if (!response.ok()) {
    throw new Error(`E2E seed failed: ${response.status()} ${await response.text()}`);
  }
  return response.json();
}

export async function resetTestData(page: Page) {
  try {
    const response = await page.request.post("/api/e2e-reset");
    if (!response.ok()) {
      console.warn(`E2E reset failed: ${response.status()} ${await response.text()}`);
    }
  } catch (error) {
    console.warn("E2E reset error:", error);
  }
}

export async function cleanupTestData(page: Page) {
  try {
    const response = await page.request.post("/api/e2e-cleanup");
    if (!response.ok()) {
      console.warn(`E2E cleanup failed: ${response.status()} ${await response.text()}`);
    }
  } catch (error) {
    console.warn("E2E cleanup error:", error);
  }
}
