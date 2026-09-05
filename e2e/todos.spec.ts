import { expect, test } from "@playwright/test";
import { resetDatabase, signIn, sql } from "./helpers.js";

test.beforeEach(async ({ context }) => {
  await resetDatabase();
  await signIn(context);
});

test("create, complete and delete a todo", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText(/nothing to do/i)).toBeVisible();

  const input = page.getByLabel("New todo");
  await input.fill("Write the README");
  await input.press("Enter");
  await expect(page.getByText("Write the README")).toBeVisible();
  await input.fill("Deploy to Railway");
  await page.getByRole("button", { name: "Add" }).click();

  const items = page.getByRole("listitem");
  await expect(items).toHaveCount(2);
  await expect(items.first()).toContainText("Deploy to Railway"); // newest first
  await expect(page.getByText("2 of 2 remaining")).toBeVisible();

  // click() rather than check(): the checkbox is controlled and updates after the API call.
  await page.getByRole("checkbox", { name: "Write the README" }).click();
  await expect(page.getByRole("checkbox", { name: "Write the README" })).toBeChecked();
  await expect(page.getByText("1 of 2 remaining")).toBeVisible();
  await page.screenshot({ path: "e2e/screenshots/todos.png" });

  // State survives a reload because it lives in Postgres.
  await page.reload();
  await expect(page.getByRole("checkbox", { name: "Write the README" })).toBeChecked();

  await items.filter({ hasText: "Write the README" }).hover();
  await page.getByRole("button", { name: "Delete Write the README" }).click();
  await expect(items).toHaveCount(1);
  await expect(page.getByText("1 of 1 remaining")).toBeVisible();
});

test("empty titles are rejected without a request", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("New todo").fill("   ");
  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.getByRole("alert")).toContainText("Title is required");
  const rows = await sql`select count(*)::int as n from todos`;
  expect(rows[0]!.n).toBe(0);
});
