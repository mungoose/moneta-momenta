import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { guardConsole, heading } from "./helpers";

// Automated accessibility checks (axe) on every screen, in the light and the dark
// theme, at both project widths. They catch contrast, missing labels, landmarks
// and duplicate ids; keyboard order and screen reader wording still need a person.

guardConsole();

/** WCAG 2.2 A and AA, the level the app promises. */
const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

const OTHER_BANK = path.join(__dirname, "..", "tests/fixtures/other-bank.csv");

/** Runs axe on the whole page and fails with one line per rule and element, so the report says what to fix. */
async function expectNoViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  const found = violations.flatMap((v) => v.nodes.map((node) => `${v.id}: ${node.target.join(" ")}`));
  expect(found).toEqual([]);
}

/** Each screen, opened the way a user reaches it, ending once it has rendered. */
const SCREENS: { name: string; open: (page: Page) => Promise<void> }[] = [
  {
    name: "landing",
    open: async (page) => {
      await page.goto("/en");
      await expect(heading(page)).toHaveText("Check if an instalment plan fits your budget, month by month.");
    },
  },
  {
    name: "landing in Estonian",
    open: async (page) => {
      await page.goto("/et");
      await expect(page.locator("html")).toHaveAttribute("lang", "et");
      await expect(heading(page)).toBeVisible();
    },
  },
  {
    name: "summary",
    open: async (page) => {
      await page.goto("/en");
      await page.getByRole("button", { name: "Comfortable budget sample" }).click();
      await expect(heading(page)).toHaveText("Here's what your money usually looks like");
    },
  },
  {
    // Estonian, 12 months, tight sample: one-off income and "usually" amounts, the longest callout.
    name: "summary with one-off amounts",
    open: async (page) => {
      await page.goto("/et?sample=tight&period=12");
      await expect(page.locator(".mm-callout--info")).toContainText("Ühekordne tulu");
    },
  },
  {
    name: "purchase with field errors",
    open: async (page) => {
      await page.goto("/en");
      await page.getByRole("button", { name: "Comfortable budget sample" }).click();
      await page.getByRole("button", { name: "Continue to the purchase" }).click();
      await page.getByLabel("Price").fill("abc");
      await page.getByLabel("Upfront payment").fill("abc");
      await page.getByRole("button", { name: "Check affordability" }).click();
      await expect(page.getByText("Enter an amount, like 1200 or 1200.50.").first()).toBeVisible();
    },
  },
  {
    name: "result that fits",
    open: async (page) => {
      await page.goto("/en?sample=comfortable&price=100&n=3");
      await expect(page.getByRole("heading", { level: 2, name: "The plan fits every month" })).toBeVisible();
    },
  },
  {
    name: "result that is tight",
    open: async (page) => {
      await page.goto("/en?sample=comfortable&period=12&price=1200&n=12");
      await expect(page.getByRole("heading", { level: 2, name: /tight/ })).toBeVisible();
    },
  },
  {
    name: "result that doesn't fit",
    open: async (page) => {
      await page.goto("/en?sample=comfortable&price=3000&n=6");
      await expect(page.getByRole("heading", { level: 2, name: /2 months come up short/ })).toBeVisible();
    },
  },
  {
    name: "explanation drawer",
    open: async (page) => {
      await page.goto("/et?sample=comfortable&price=1200&n=12&upfront=150&rate=9.9&fee=2.5");
      await page.getByRole("button", { name: "Kuidas me selle arvutasime" }).click();
      await expect(page.getByRole("dialog", { name: "Kuidas me selle arvutasime" })).toBeVisible();
    },
  },
  {
    name: "upload error",
    open: async (page) => {
      await page.goto("/en");
      const chooser = page.waitForEvent("filechooser");
      await page.getByRole("button", { name: "Choose a transactions file" }).click();
      await (await chooser).setFiles(OTHER_BANK);
      await expect(heading(page)).toHaveText("We couldn't read this file");
      await expect(page.locator(".mm-colcheck")).toBeVisible();
    },
  },
];

for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`${colorScheme} theme`, () => {
    test.use({ colorScheme });

    for (const screen of SCREENS) {
      test(`${screen.name} has no axe violations`, async ({ page }) => {
        await screen.open(page);
        await expectNoViolations(page);
      });
    }
  });
}

test("a 320px window (400% zoom on a laptop) never scrolls sideways", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  const overflow = () =>
    page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

  // Estonian, with every term set: the longest header and result copy.
  await page.goto("/et?sample=comfortable&price=1200&n=12&upfront=150&rate=9.9&fee=2.5");
  await expect(page.getByRole("table")).toBeVisible();
  expect(await overflow()).toBe(0);

  await page.getByRole("button", { name: "Muuda ostu" }).click();
  await expect(page.getByLabel("Hind")).toBeVisible();
  expect(await overflow()).toBe(0);
});

test("the dark theme follows the system setting", async ({ page }) => {
  const background = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/en");
  expect(await background()).toBe("rgb(244, 245, 246)");

  await page.emulateMedia({ colorScheme: "dark" });
  expect(await background()).toBe("rgb(14, 19, 23)");
});
