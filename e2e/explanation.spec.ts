import { expect, test, type Page } from "@playwright/test";
import { guardConsole } from "./helpers";

// "How we calculated this": a modal drawer on the result that walks through the
// verdict with the user's own numbers, and gives focus back when it closes.

guardConsole();

// The sample's prefilled purchase: €1,200 over 12 at 0%, 6-month average.
const SAMPLE_RESULT = "/en?sample=comfortable&price=1200&n=12";
const BUTTON = "How we calculated this";

/** Opens the sample result and its drawer. */
async function openDrawer(page: Page) {
  await page.goto(SAMPLE_RESULT);
  await page.getByRole("button", { name: BUTTON }).click();
  const drawer = page.getByRole("dialog", { name: BUTTON });
  await expect(drawer).toBeVisible();
  return drawer;
}

test("walks through the sample's verdict in four steps, with its numbers", async ({ page }) => {
  const drawer = await openDrawer(page);

  await expect(drawer.getByRole("heading", { level: 3 })).toHaveText([
    "Your usual margin",
    "Your monthly instalment",
    "Months that cost more last time",
    "What's left each month",
  ]);
  await expect(drawer).toContainText("€2,537.13 average income − €2,023.19 usual spending = €513.94");
  await expect(drawer).toContainText("May 2026 to October 2026");
  await expect(drawer).toContainText("€1,200.00 ÷ 12 = €100.00 a month");
  // July 2027 counts on July 2026's spending, and it's the month that decides the verdict.
  await expect(drawer).toContainText("July 2027: €2,537.13 − €2,443.62 − €100.00 = -€6.49");
  await expect(drawer).toContainText("€0.00 to €253.70 left");
  await expect(drawer).toContainText("The €253.71 cushion is 10% of your average income");
});

test("shows interest, fees and the upfront payment when the plan has them", async ({ page }) => {
  await page.goto("/en?sample=comfortable&price=1200&n=12&upfront=150&rate=9.9&fee=2.5");
  await page.getByRole("button", { name: BUTTON }).click();
  const drawer = page.getByRole("dialog", { name: BUTTON });

  await expect(drawer).toContainText("€1,200.00 price − €150.00 upfront = €1,050.00 to spread");
  await expect(drawer).toContainText("€1,050.00 + €57.12 interest + €30.00 fees (12 × €2.50) = €1,137.12");
  await expect(drawer).toContainText("€1,137.12 ÷ 12 = €94.76 a month");
  await expect(drawer).toContainText("The interest at 9.9% a year");
});

test("Esc closes it and gives focus back to the button", async ({ page }) => {
  const drawer = await openDrawer(page);
  // Focus starts inside the modal, not on the page behind it.
  await expect(drawer.getByRole("button", { name: "Close" }).first()).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  await expect(page.getByRole("button", { name: BUTTON })).toBeFocused();
});

test("both Close buttons close it", async ({ page }) => {
  const close = (page: Page) => page.getByRole("dialog", { name: BUTTON }).getByRole("button", { name: "Close" });

  await openDrawer(page);
  await close(page).first().click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByRole("button", { name: BUTTON })).toBeFocused();

  await page.getByRole("button", { name: BUTTON }).click();
  await close(page).last().click();
  await expect(page.getByRole("dialog")).toBeHidden();
});

test("a click on the dimmed page behind it closes it", async ({ page }) => {
  const drawer = await openDrawer(page);
  const box = await drawer.boundingBox();
  // On a phone the drawer covers the whole width, so there's no page left to click.
  test.skip(box === null || box.x < 100, "the drawer fills the screen");

  await page.mouse.click(50, 400);
  await expect(drawer).toBeHidden();
});

test("the page behind it doesn't scroll while it's open", async ({ page }) => {
  await openDrawer(page);
  await expect(page.locator("html")).toHaveCSS("overflow", "hidden");

  await page.keyboard.press("Escape");
  await expect(page.locator("html")).not.toHaveCSS("overflow", "hidden");
});
