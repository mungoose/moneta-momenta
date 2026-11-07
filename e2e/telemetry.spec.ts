import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { guardConsole, heading } from "./helpers";

// Telemetry: one event per user action, each holding only its whitelisted
// fields. The demo's sink logs to the console, so the tests read it there.

guardConsole();

const OTHER_BANK = path.join(__dirname, "..", "tests/fixtures/other-bank.csv");
const RESULT_TITLE = "€1,200.00 over 12 instalments";

/**
 * Collects the payloads the page logs as `[telemetry]`, in order.
 * @returns  A function giving the payloads logged so far, with the session ID
 *           checked (one per page load) and then left out, so tests compare the rest exactly.
 */
function telemetry(page: Page): () => Promise<unknown[]> {
  const logged: Promise<unknown>[] = [];
  page.on("console", (msg) => {
    const payload = msg.args()[1];
    if (msg.type() === "info" && msg.text().startsWith("[telemetry]") && payload) {
      logged.push(payload.jsonValue());
    }
  });
  return async () => {
    const payloads = (await Promise.all(logged)) as { session?: unknown }[];
    const sessions = new Set(payloads.map((p) => p.session));
    expect(sessions.size, "one session ID per page load").toBeLessThanOrEqual(1);
    for (const session of sessions) {
      expect(session).toMatch(/^[0-9a-f]{32}$/);
    }
    return payloads.map((payload) => {
      const event = { ...payload };
      delete event.session;
      return event;
    });
  };
}

test("the sample flow sends one event per action, with no figures", async ({ page }) => {
  const sent = telemetry(page);
  await page.goto("/en");
  await page.getByRole("button", { name: "comfortable budget" }).click();
  await expect(heading(page)).toHaveText("Here's what your money usually looks like");

  await page.getByRole("button", { name: "12 months" }).click();
  // Picking the period that's already chosen changes nothing, so it sends nothing.
  await page.getByRole("button", { name: "12 months" }).click();
  await page.getByRole("button", { name: "6 months" }).click();
  await page.getByRole("button", { name: "Continue to the purchase" }).click();
  await page.getByRole("button", { name: "Check affordability" }).click();
  await expect(heading(page)).toHaveText(RESULT_TITLE);

  // Moving through history re-renders the result without a new check.
  await page.goBack();
  await expect(heading(page)).toHaveText("What would you like to buy?");
  await page.goForward();
  await expect(heading(page)).toHaveText(RESULT_TITLE);

  await expect.poll(sent).toEqual([
    { name: "flow_started", source: "sample" },
    { name: "period_changed", months: 12 },
    { name: "period_changed", months: 6 },
    { name: "plan_checked", verdict: "no-fit", instalments: "12", priceBucket: "1000–3000", hasInterest: true },
  ]);
});

test("a sample link that opens a result counts only the checks made after it", async ({ page }) => {
  const sent = telemetry(page);
  await page.goto("/en?sample=comfortable&price=1200&n=12");
  await expect(heading(page)).toHaveText(RESULT_TITLE);

  await page.getByRole("button", { name: "Change the purchase" }).click();
  await page.getByLabel("Interest rate").fill("9.9");
  await page.getByRole("button", { name: "Check affordability" }).click();
  // Interest makes July 2027 come up shorter than the interest-free €6.49.
  await expect(page.getByRole("heading", { level: 2, name: /July 2027 comes up €11\.93 short/ })).toBeVisible();

  await expect
    .poll(sent)
    .toEqual([
      { name: "plan_checked", verdict: "no-fit", instalments: "12", priceBucket: "1000–3000", hasInterest: true },
    ]);
});

test("opening the explanation sends an event each time, with no figures", async ({ page }) => {
  const sent = telemetry(page);
  await page.goto("/en?sample=comfortable&price=1200&n=12");
  const button = page.getByRole("button", { name: "How we calculated this" });

  await button.click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await button.click();

  await expect.poll(sent).toEqual([{ name: "explanation_opened" }, { name: "explanation_opened" }]);
});

test("a failed upload sends the error's code only", async ({ page }) => {
  const sent = telemetry(page);
  await page.goto("/en");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Upload a transactions file" }).click();
  await (await chooser).setFiles(OTHER_BANK);
  await expect(heading(page)).toHaveText("We couldn't read this file");

  await expect.poll(sent).toEqual([
    { name: "flow_started", source: "upload" },
    { name: "import_failed", reason: "missing-columns" },
  ]);
});
