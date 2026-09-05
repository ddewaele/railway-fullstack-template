import { expect, test } from "@playwright/test";
import { resetDatabase, signIn, sql } from "./helpers.js";

test.beforeEach(async () => {
  await resetDatabase();
});

test("anonymous visitors see the Google login page", async ({ page }) => {
  await page.goto("/");
  const link = page.getByRole("link", { name: /continue with google/i });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute("href", "/api/auth/google");
  await page.screenshot({ path: "e2e/screenshots/login.png" });
});

test("the login link starts the Google OAuth flow", async ({ page }) => {
  await page.goto("/");
  // Follow the redirect manually so the test never depends on Google itself.
  const response = await page.request.get("/api/auth/google", { maxRedirects: 0 });
  expect(response.status()).toBe(302);
  const location = new URL(response.headers()["location"]!);
  expect(location.origin).toBe("https://accounts.google.com");
  expect(location.searchParams.get("redirect_uri")).toBe(
    "http://localhost:3100/api/auth/google/callback",
  );
});

test("a failed OAuth callback shows an error on the login page", async ({ page }) => {
  await page.goto("/login?error=oauth_failed");
  await expect(page.getByRole("alert")).toContainText(/sign-in with google failed/i);
});

test("signed-in users see their name and can sign out", async ({ page, context }) => {
  const user = await signIn(context, { name: "Ada Lovelace" });
  await page.goto("/");
  await expect(page.getByText(user.name)).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("link", { name: /continue with google/i })).toBeVisible();

  // The session was deleted server-side, not just the cookie.
  const rows = await sql`select count(*)::int as n from sessions`;
  expect(rows[0]!.n).toBe(0);
});
