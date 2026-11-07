import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { guardConsole, heading } from "./helpers";

// The upload path: a file picked through the landing's button goes through the
// same load pipeline as the sample, to a verdict or to the error screen. The
// file is never kept, so reloads, the language switch and history entries of
// an earlier upload end on the landing with an "upload it again" note.

guardConsole();

/** Uploads count from today's month, so the clock is fixed: the reference month is November 2026, as for the sample. */
const TODAY = new Date("2026-11-15T12:00:00");

const ROOT = path.join(__dirname, "..");
const SAMPLE = path.join(ROOT, "public/samples/en_comfortable.tsv");
const unitFixture = (name: string) => path.join(ROOT, "tests/fixtures", name);
const e2eFixture = (name: string) => path.join(__dirname, "fixtures", name);

/** The same purchase and verdict as the sample flow: the uploaded sample must give the same answer. */
const SAMPLE_VERDICT = /July 2027 comes up €6\.49 short/;

const LANDING_TITLE = "Check if an instalment plan fits your budget, month by month.";
const UPLOAD_GONE = "Your file isn't kept when the page reloads or changes language. Upload it again to continue.";

const HEADER = [
  "Account",
  "Flag",
  "Date",
  "Payee",
  "Category Group/Category",
  "Category Group",
  "Category",
  "Memo",
  "Outflow",
  "Inflow",
  "Cleared",
]
  .map((name) => `"${name}"`)
  .join("\t");

/** One row of the accepted format; amounts as written in the file. */
function row(date: string, group: string, category: string, outflow: string, inflow: string): string {
  return ["SEB", "", date, "Payee", `${group}: ${category}`, group, category, ""]
    .map((cell) => `"${cell}"`)
    .concat([outflow, inflow, `"Cleared"`])
    .join("\t");
}

/** A TSV upload built in the test, for errors no fixture file covers. */
function tsv(name: string, rows: string[]) {
  return { name, mimeType: "text/tab-separated-values", buffer: Buffer.from([HEADER, ...rows].join("\n")) };
}

type Upload = string | { name: string; mimeType: string; buffer: Buffer };

/** Picks a file through the button, the way a user does: the button opens the hidden input's file picker. */
async function upload(page: Page, file: Upload, button = "Upload a transactions file") {
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: button }).click();
  await (await chooser).setFiles(file);
}

async function openLanding(page: Page, locale = "en") {
  await page.clock.setFixedTime(TODAY);
  await page.goto(`/${locale}`);
  await expect(heading(page)).toBeVisible();
}

/** Summary → purchase → result with the prefilled purchase. */
async function checkPrefilledPurchase(page: Page) {
  await page.getByRole("button", { name: "Continue to the purchase" }).click();
  await expect(heading(page)).toHaveText("What would you like to buy?");
  await page.getByRole("button", { name: "Check affordability" }).click();
  await expect(heading(page)).toHaveText("€1,200.00 over 12 instalments");
}

/** The error callout. Scoped to the page content: Next.js adds its own empty `role="alert"` route announcer. */
const alert = (page: Page) => page.getByRole("main").getByRole("alert");

test("an uploaded file goes through every step to a verdict", async ({ page }) => {
  await openLanding(page);
  await upload(page, SAMPLE);

  await expect(heading(page)).toHaveText("Here's what your money usually looks like");
  await expect(page.getByText(/^en_comfortable\.tsv: [\d,]+ transactions, /)).toBeVisible();
  // Uploaded data is never put in the URL, and isn't labelled as the sample.
  await expect(page).toHaveURL(/\/en$/);
  await expect(page.getByText("Sample data", { exact: true })).toHaveCount(0);

  await checkPrefilledPurchase(page);
  await expect(page.getByRole("heading", { level: 2, name: SAMPLE_VERDICT })).toBeVisible();
  await expect(page.getByRole("table")).toBeVisible();
  await expect(page).toHaveURL(/\/en$/);
});

test("Back and Forward move between the steps of an upload", async ({ page }) => {
  await openLanding(page);
  await upload(page, SAMPLE);
  await page.getByRole("button", { name: "Continue to the purchase" }).click();
  await expect(heading(page)).toHaveText("What would you like to buy?");

  await page.goBack();
  await expect(heading(page)).toHaveText("Here's what your money usually looks like");
  await page.goForward();
  await expect(heading(page)).toHaveText("What would you like to buy?");
});

/**
 * Every way a file can be refused, with the screen's titles. `template` is
 * whether the template link shows: not when the file was read but its data
 * can't be used.
 */
const ERRORS: { name: string; file: Upload; h1: string; title: string; body?: RegExp; template: boolean }[] = [
  {
    name: "too large",
    file: { name: "huge.tsv", mimeType: "text/plain", buffer: Buffer.alloc(5 * 1024 * 1024 + 1, "a") },
    h1: "We couldn't read this file",
    title: "This file is too large",
    body: /huge\.tsv is larger than 5 MB/,
    template: true,
  },
  {
    name: "not text",
    file: { name: "photo.csv", mimeType: "text/csv", buffer: Buffer.from([0x44, 0x00, 0x61]) },
    h1: "We couldn't read this file",
    title: "This isn't a text file",
    body: /photo\.csv isn't a CSV or TSV file/,
    template: true,
  },
  {
    name: "empty",
    file: unitFixture("empty.tsv"),
    h1: "We couldn't read this file",
    title: "The file has no transactions",
    template: true,
  },
  {
    name: "header only",
    file: unitFixture("header-only.tsv"),
    h1: "We couldn't read this file",
    title: "The file has no transactions",
    body: /header-only\.tsv has no rows below the column names/,
    template: true,
  },
  {
    name: "malformed",
    file: tsv("short-row.tsv", [`"SEB"\t""\t"31/10/2026"`]),
    h1: "We couldn't read this file",
    title: "Line 2 doesn't match the columns",
    template: true,
  },
  {
    name: "bad date",
    file: unitFixture("bad-date.tsv"),
    h1: "We couldn't read this file",
    title: "Line 3 has a date we can't read",
    body: /“2026-10-30” isn't a date/,
    template: true,
  },
  {
    name: "bad amount",
    file: tsv("bad-amount.tsv", [row("31/10/2026", "Food & Drink", "Groceries", "12.5x", "0,00")]),
    h1: "We couldn't read this file",
    title: "Line 2 has an amount we can't read",
    body: /“12\.5x” in the Outflow column/,
    template: true,
  },
  {
    name: "too little data",
    file: unitFixture("two-months.tsv"),
    h1: "We can't use this file yet",
    title: "Found 2 full months; at least 3 are needed",
    template: false,
  },
  {
    name: "no income",
    file: tsv("no-income.tsv", [
      row("01/10/2026", "Food & Drink", "Groceries", "100,00", "0,00"),
      row("01/09/2026", "Food & Drink", "Groceries", "100,00", "0,00"),
      row("01/08/2026", "Food & Drink", "Groceries", "100,00", "0,00"),
    ]),
    h1: "We can't use this file yet",
    title: "No income found",
    template: false,
  },
  {
    // Two spends of 2^52 cents each: the month's total leaves the safe-integer range.
    name: "a total too large to count",
    file: tsv("overflow.tsv", [
      row("25/10/2026", "Inflow", "Ready to Assign", "0,00", "2000,00"),
      row("05/10/2026", "Home", "Purchase", "45035996273704,96", "0,00"),
      row("04/10/2026", "Home", "Purchase", "45035996273704,96", "0,00"),
      row("25/09/2026", "Inflow", "Ready to Assign", "0,00", "2000,00"),
      row("25/08/2026", "Inflow", "Ready to Assign", "0,00", "2000,00"),
    ]),
    h1: "We couldn't read this file",
    title: "Something went wrong reading this file",
    body: /overflow\.tsv passed every check but still couldn't be used/,
    template: true,
  },
];

for (const { name, file, h1, title, body, template } of ERRORS) {
  test(`an upload that is ${name} shows why and how to fix it`, async ({ page }) => {
    await openLanding(page);
    await upload(page, file);

    await expect(heading(page)).toHaveText(h1);
    await expect(heading(page)).toBeFocused();
    await expect(alert(page)).toContainText(title);
    if (body) {
      await expect(alert(page)).toContainText(body);
    }
    await expect(page.getByText("Upload the new file. Nothing from this attempt was kept.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Download a template CSV" })).toHaveCount(template ? 1 : 0);
    // The error screen isn't a step: the URL stays the landing's.
    await expect(page).toHaveURL(/\/en$/);
  });
}

test("missing columns are listed one by one, and a fixed file then loads", async ({ page }) => {
  await openLanding(page);
  await upload(page, unitFixture("other-bank.csv"));

  await expect(heading(page)).toHaveText("We couldn't read this file");
  await expect(alert(page)).toContainText("Missing required columns");
  await expect(alert(page)).toContainText(
    "other-bank.csv has no Payee, Category Group, Category, Outflow and Inflow columns.",
  );
  const columns = page.locator(".mm-colcheck li");
  await expect(columns).toHaveText([
    /Date\s*Found/,
    /Payee\s*Missing/,
    /Category Group\s*Missing/,
    /Category\s*Missing/,
    /Outflow\s*Missing/,
    /Inflow\s*Missing/,
  ]);
  await expect(page.getByRole("link", { name: "Download a template CSV" })).toHaveAttribute(
    "href",
    "/transactions-template.csv",
  );

  await upload(page, SAMPLE, "Upload another file");
  await expect(heading(page)).toHaveText("Here's what your money usually looks like");
});

test("the error screen offers the sample instead", async ({ page }) => {
  await openLanding(page);
  await upload(page, unitFixture("bad-date.tsv"));
  await expect(heading(page)).toHaveText("We couldn't read this file");

  await page.getByRole("button", { name: "Try with sample data" }).click();
  await expect(heading(page)).toHaveText("Here's what your money usually looks like");
  await expect(page).toHaveURL(/\/en\?sample=comfortable$/);
});

test("a file that stops early is flagged and still reaches a verdict", async ({ page }) => {
  await openLanding(page);
  await upload(page, e2eFixture("ends-early.tsv"));

  await expect(heading(page)).toHaveText("Here's what your money usually looks like");
  await expect(page.getByText("Your transactions stop on 11 October")).toBeVisible();
  await expect(page.getByText(/If some of the spending in October 2026 is missing/)).toBeVisible();

  await checkPrefilledPurchase(page);
  await expect(page.getByRole("heading", { level: 2 }).first()).toBeVisible();
  await expect(
    page.getByText(
      "Your file's first or last month may be missing transactions, so this result may look better than it is.",
    ),
  ).toBeVisible();
});

test("a file that starts late is flagged once its first month is in the period", async ({ page }) => {
  await openLanding(page);
  await upload(page, e2eFixture("starts-late.tsv"));

  await expect(heading(page)).toHaveText("Here's what your money usually looks like");
  // The default 6 months don't reach back to November 2025.
  await expect(page.getByText("Your transactions start on 19 November")).toHaveCount(0);
  await page.getByRole("button", { name: "12 months" }).click();
  await expect(page.getByText("Your transactions start on 19 November")).toBeVisible();
});

test("months without income and an old end date are warned about", async ({ page }) => {
  // Two months after the file ends: December 2026 is missing, so the data is out of date.
  await page.clock.setFixedTime(new Date("2027-01-15T12:00:00"));
  await page.goto("/en");
  await upload(page, unitFixture("no-income-month.tsv"));

  await expect(heading(page)).toHaveText("Here's what your money usually looks like");
  await expect(page.getByText("Your transactions end in October 2026")).toBeVisible();
  await expect(page.getByText(/^No income in September 2026/)).toBeVisible();
});

test("a reload where an upload was shown asks for the file again", async ({ page }) => {
  await openLanding(page);
  await upload(page, SAMPLE);
  await expect(heading(page)).toHaveText("Here's what your money usually looks like");

  await page.reload();
  await expect(heading(page)).toHaveText(LANDING_TITLE);
  await expect(page.getByText(UPLOAD_GONE)).toBeVisible();
});

test("the language switch keeps no file data and asks for the file again", async ({ page }) => {
  await openLanding(page);
  await upload(page, SAMPLE);
  await expect(heading(page)).toHaveText("Here's what your money usually looks like");

  await page.getByRole("link", { name: "Eesti keeles" }).click();
  await expect(page).toHaveURL(/\/et\?upload$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "et");
  await expect(heading(page)).toHaveText("Vaata kuude kaupa, kas järelmaks mahub sinu eelarvesse.");
  await expect(
    page.getByText(
      "Faili ei säilitata, kui leht uuesti laaditakse või keel vahetub. Jätkamiseks laadi see uuesti üles.",
    ),
  ).toBeVisible();
});

test("Back into an upload's step after Start over opens the landing", async ({ page }) => {
  await openLanding(page);
  await upload(page, SAMPLE);
  await page.getByRole("button", { name: "Continue to the purchase" }).click();
  await expect(heading(page)).toHaveText("What would you like to buy?");

  await page.getByRole("button", { name: "Start over" }).click();
  await expect(heading(page)).toHaveText(LANDING_TITLE);
  await expect(page.getByText(UPLOAD_GONE)).toHaveCount(0);

  await page.goBack();
  await expect(heading(page)).toHaveText(LANDING_TITLE);
  await expect(page.getByText(UPLOAD_GONE)).toBeVisible();
});

test("the Estonian upload error lists the columns in Estonian copy", async ({ page }) => {
  await openLanding(page, "et");
  await upload(page, unitFixture("other-bank.csv"), "Laadi üles tehingute fail");

  await expect(heading(page)).toHaveText("Me ei saanud seda faili lugeda");
  await expect(alert(page)).toContainText("Nõutud veerud puuduvad");
  await expect(page.getByRole("button", { name: "Laadi üles teine fail" })).toBeVisible();
});
