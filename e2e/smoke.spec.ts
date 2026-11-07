import { expect, test } from "@playwright/test";
import { guardConsole, heading } from "./helpers";

// Smoke tests for the sample flow: landing → summary → purchase → result, plus
// the browser history and sample links. The upload path gets its own specs.

const allowErrors = guardConsole();

// The sample's prefilled purchase (€1,200 over 12 at 0%, 6-month average) fails in one month:
// July 2027 counts on the July 2026 spending and ends €6.49 short.
const SAMPLE_VERDICT = /It fits, but July 2027 needs €6\.49 from savings/;
/** The same purchase at the form's default 9.9% rate: links without a rate mean 0%, the form starts at 9.9%. */
const PREFILLED_VERDICT = /It fits, but July 2027 needs €11\.93 from savings/;

test("root redirects to the English landing", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/en$/);
  await expect(heading(page)).toHaveText("Check if an instalment plan fits your budget, month by month.");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});

test("sample data goes through every step to a verdict", async ({ page }) => {
  await page.goto("/en");
  await page.getByRole("button", { name: "comfortable budget" }).click();

  await expect(heading(page)).toHaveText("Here's what your money usually looks like");
  await expect(page).toHaveURL(/\/en\?sample=comfortable$/);
  await page.getByRole("button", { name: "Continue to the purchase" }).click();

  await expect(heading(page)).toHaveText("What would you like to buy?");
  await page.getByRole("button", { name: "Check affordability" }).click();

  await expect(heading(page)).toHaveText("€1,200.00 over 12 instalments");
  await expect(page.getByRole("heading", { level: 2, name: PREFILLED_VERDICT })).toBeVisible();
  await expect(page).toHaveURL(/sample=comfortable.*price=1200.*n=12.*rate=9\.9/);
  await expect(page.getByRole("table")).toBeVisible();
});

test("the summary lists the period's one-off amounts, and they follow the period", async ({ page }) => {
  await page.goto("/en");
  await page.getByRole("button", { name: "comfortable budget" }).click();
  const callout = page.locator(".mm-callout--info");

  // 6 months, May–October 2026: the summer trip and a dentist bill, all spending.
  await expect(callout.locator(".mm-callout__title")).toHaveText("3 amounts stood out");
  await expect(callout.getByRole("listitem")).toHaveText([
    /Accommodation · July 2026\s*€520\.00/,
    /Travel · July 2026\s*€300\.00/,
    /Doctor & dentist · June 2026\s*€117\.42/,
  ]);
  await expect(callout).toContainText("If a plan reaches the same month of the year");
  await expect(callout).not.toContainText("One-off income");

  // 12 months adds December's gifts and April's tax refund, which is income.
  await page.getByRole("button", { name: "12 months" }).click();
  await expect(callout.locator(".mm-callout__title")).toHaveText("5 amounts stood out");
  await expect(callout.getByRole("listitem").nth(1)).toHaveText(/Tax Authority \(income\) · April 2026\s*€340\.00/);
  await expect(callout).toContainText("One-off income raises the average income.");

  // The last 3 months have nothing unusual, so there's no callout.
  await page.getByRole("button", { name: "3 months" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Usual monthly margin" })).toBeVisible();
  await expect(callout).toHaveCount(0);
});

test("Back returns to the previous step", async ({ page }) => {
  await page.goto("/en");
  await page.getByRole("button", { name: "comfortable budget" }).click();
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

test("a budget with no room above the buffer says no terms can fit", async ({ page }) => {
  await page.goto("/en?sample=tight&price=1200&n=12");
  await expect(
    page.getByRole("heading", { level: 2, name: "You usually have €4.94 left a month, less than the €217.40 buffer" }),
  ).toBeVisible();
  await expect(page.getByText(/^So no instalment fits every month right now/)).toBeVisible();
  await expect(page.getByText(/would fit every month/)).toHaveCount(0);
});

test("a plan that doesn't fit names the largest payment that would", async ({ page }) => {
  await page.goto("/en?sample=comfortable&price=3000&n=6");
  await expect(page.getByText("A monthly payment of up to €194.75 would fit every month.")).toBeVisible();
});

test("Estonian copy inflects a month inside a sentence", async ({ page }) => {
  // December, not July: July's genitive is the same word as its nominative, so it would hide the bug.
  await page.goto("/et?sample=comfortable&period=3&price=3000&n=6");
  await expect(
    page.getByRole("heading", {
      level: 2,
      name: "2 kuul jääb puudu, kõige rohkem 2026. aasta detsembri puhul: 50,82 €",
    }),
  ).toBeVisible();
  await expect(
    page.getByText(/^Sul kulus 2025\. aasta detsembri jooksul .* 2026\. aasta detsembri puhul sellega\.$/),
  ).toBeVisible();
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
  await page.getByRole("button", { name: "comfortable budget" }).click();
  await page.getByRole("button", { name: "Continue to the purchase" }).click();

  const price = page.getByLabel("Price", { exact: true });
  await price.fill("");
  await page.getByRole("button", { name: "Check affordability" }).click();

  await expect(heading(page)).toHaveText("What would you like to buy?");
  await expect(page.getByText("Enter the price.")).toBeVisible();
  await expect(price).toBeFocused();
  await expect(price).toHaveAttribute("aria-invalid", "true");
});

test("unknown locale redirects to English and keeps the sample link", async ({ page }) => {
  await page.goto("/lv?sample=comfortable&price=1200&n=12");
  await expect(page).toHaveURL(/\/en\?sample=comfortable&price=1200&n=12$/);
  await expect(page.getByRole("heading", { level: 2, name: SAMPLE_VERDICT })).toBeVisible();
});

test("public files are not redirected", async ({ request }) => {
  const response = await request.get("/transactions-template.csv", { maxRedirects: 0 });
  expect(response.status()).toBe(200);
});

test("an unknown path with a dot is the prerendered 404", async ({ page }) => {
  // A rewrite in next.config.ts serves the prerendered 404, so its inline
  // scripts are hashed and guardConsole would catch any the CSP blocked.
  allowErrors(/status of 404/);
  const response = await page.goto("/x.y");
  expect(response?.status()).toBe(404);
});
