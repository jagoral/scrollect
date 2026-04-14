import { test, expect } from "@playwright/test";

test.describe("Error pages", () => {
  test("shows 404 page with navigation options for nonexistent route", async ({ page }) => {
    await page.goto("/this-page-does-not-exist");
    await expect(page.getByRole("heading", { name: /page not found/i })).toBeVisible();
    await expect(page.getByText(/the page you're looking for doesn't exist/i)).toBeVisible();
    await expect(page.getByRole("link", { name: /go home/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /browse feed/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /view library/i })).toBeVisible();
  });

  test("404 'Go home' navigates to home page", async ({ page }) => {
    await page.goto("/this-page-does-not-exist");
    await expect(page.getByRole("heading", { name: /page not found/i })).toBeVisible();
    await page.getByRole("link", { name: /go home/i }).click();
    await page.waitForURL("/");
  });

  test("unauthenticated access to protected route redirects to sign in", async ({ page }) => {
    await page.goto("/app/library/nonexistent-document-id");
    await page.waitForURL(/\/signin/);
    await expect(page.getByText(/welcome back/i)).toBeVisible();
  });
});
