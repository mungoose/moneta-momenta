import { expect, test } from "@playwright/test";
import { guardConsole, heading } from "./helpers";

// Smoke tests for the sample flow: landing → summary → purchase → result, plus
// the browser history and sample links. The upload path gets its own specs.

const allowErrors = guardConsole();

// The sample's prefilled purchase (€1,200 over 12 at 0%, 6-month average) fails in one month:
// July 2027 counts on the July 2026 spending and ends €6.49 short.
const SAMPLE_VERDICT = /July 2027 comes up €6\.49 short/;

test("root redirects to the English landing", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/en$/);
  await expect(heading(page)).toHaveText("Check if an instalment plan fits your budget, month by month.");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});

test("sample data goes through every step to a verdict", async ({ page }) => {
  await page.goto("/en");
  await page.getByRole("button", { name: "Try with sample data" }).click();

  await expect(heading(page)).toHaveText("Here's what your money usually looks like");
  await expect(page).toHaveURL(/\/en\?sample=comfortable$/);
  await page.getByRole("button", { name: "Continue to the purchase" }).click();

  await expect(heading(page)).toHaveText("What would you like to buy?");
  await page.getByRole("button", { name: "Check affordability" }).click();

  await expect(heading(page)).toHaveText("€1,200.00 over 12 instalments");
  await expect(page.getByRole("heading", { level: 2, name: SAMPLE_VERDICT })).toBeVisible();
  await expect(page).toHaveURL(/sample=comfortable.*price=1200.*n=12/);
  await expect(page.getByRole("table")).toBeVisible();
});

test("Back returns to the previous step", async ({ page }) => {
  await page.goto("/en");
  await page.getByRole("button", { name: "Try with sample data" }).click();
  await page.getByRole("button", { name: "Continue to the purchase" }).click();
  await expect(heading(page)).toHaveText("What would you like to buy?");

  await page.goBack();
  await expect(heading(page)).toHaveText("Here's what your money usually looks like");
  await page.goForward();
  await expect(heading(page)).toHaveText("What would you like to buy?");

  // Back to the landing: its URL drops the sample query, so a reload opens the landing too.
  await page.goBack();
  await page.goBack();
  await expect(heading(page)).toHaveText("Check if an instalment plan fits your budget, month by month.");
  await expect(page).toHaveURL(/\/en$/);
});

test("a sample link opens its result directly", async ({ page }) => {
  await page.goto("/en?sample=comfortable&price=1200&n=12");
  await expect(page.getByRole("heading", { level: 2, name: SAMPLE_VERDICT })).toBeVisible();
});

test("the language switch keeps the sample link", async ({ page }) => {
  await page.goto("/en?sample=comfortable&price=1200&n=12");
  await expect(page.getByRole("heading", { level: 2, name: SAMPLE_VERDICT })).toBeVisible();
  await page.getByRole("link", { name: "Eesti keeles" }).click();

  await expect(page).toHaveURL(/\/et\?sample=comfortable.*price=1200.*n=12/);
  await expect(page.locator("html")).toHaveAttribute("lang", "et");
  await expect(page.getByRole("table")).toBeVisible();
});

test("a missing price shows its error and takes focus", async ({ page }) => {
  await page.goto("/en");
  await page.getByRole("button", { name: "Try with sample data" }).click();
  await page.getByRole("button", { name: "Continue to the purchase" }).click();

  const price = page.getByLabel("Price", { exact: true });
  await price.fill("");
  await page.getByRole("button", { name: "Check affordability" }).click();

  await expect(heading(page)).toHaveText("What would you like to buy?");
  await expect(page.getByText("Enter the price.")).toBeVisible();
  await expect(price).toBeFocused();
  await expect(price).toHaveAttribute("aria-invalid", "true");
});

test("unknown locale is a 404", async ({ page }) => {
  allowErrors(/status of 404/);
  const response = await page.goto("/lv");
  expect(response?.status()).toBe(404);
});
