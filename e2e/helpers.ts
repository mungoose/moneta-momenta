import { expect, test, type Page } from "@playwright/test";

/**
 * Fails every test in the calling spec on a browser console error or an
 * uncaught page error. CSP violations and runtime errors surface this way.
 * @returns  A function a test calls to allow errors matching its patterns.
 */
export function guardConsole(): (...patterns: RegExp[]) => void {
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

  return (...patterns) => {
    expectedErrors.push(...patterns);
  };
}

/** The current step's title. */
export const heading = (page: Page) => page.getByRole("heading", { level: 1 });
