import { expect, test } from "@playwright/test";

// Day 0 shell check. Replaced by the full flow (sample → purchase → verdict) on Day 2.

// CSP violations and runtime errors surface as console errors: every test fails on any,
// except errors a test explicitly expects.
let consoleErrors: string[] = [];
let expectedErrors: RegExp[] = [];

test.beforeEach(({ page }) => {
  consoleErrors = [];
  expectedErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    }
  });
  page.on("pageerror", (err) => consoleErrors.push(err.message));
});

test.afterEach(() => {
  const unexpected = consoleErrors.filter((text) => !expectedErrors.some((re) => re.test(text)));
  expect(unexpected, "unexpected browser console errors").toEqual([]);
});

test("root redirects to English landing", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/en$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Moneta Momenta");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});

test("language switch opens the Estonian page", async ({ page }) => {
  await page.goto("/en");
  await page.getByRole("link", { name: "Eesti keeles" }).click();
  await expect(page).toHaveURL(/\/et$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "et");
});

test("unknown locale is a 404", async ({ page }) => {
  expectedErrors = [/status of 404/];
  const response = await page.goto("/lv");
  expect(response?.status()).toBe(404);
});
