import { expect, test, type Page } from "@playwright/test";
import { guardConsole } from "./helpers";

// The production CSP: inline scripts run only when Next wrote them (their hash
// is in the header), so injected markup can't run script and read an upload.
// Every other spec checks, through guardConsole, that no step trips the policy.

const allowErrors = guardConsole();

/** The page's CSP directives by name, from the response header. */
async function cspOf(page: Page, path: string): Promise<Map<string, string[]>> {
  const response = await page.goto(path);
  const header = response?.headers()["content-security-policy"] ?? "";
  return new Map(
    header.split(";").map((directive) => {
      const [name = "", ...sources] = directive.trim().split(/\s+/);
      return [name, sources];
    }),
  );
}

/** The sample link's name in each locale: clicking it is the hydration check. */
const SAMPLE_BUTTON = { "/en": "Comfortable budget sample", "/et": "Mugava eelarve näidis" };

for (const [path, sampleButton] of Object.entries(SAMPLE_BUTTON)) {
  test(`${path} allows only same-origin and hashed scripts`, async ({ page }) => {
    const csp = await cspOf(page, path);
    const [self, ...hashes] = csp.get("script-src") ?? [];
    expect(self).toBe("'self'");
    expect(hashes).not.toContain("'unsafe-inline'");
    expect(hashes).not.toContain("'unsafe-eval'");
    expect(hashes.length).toBeGreaterThan(0);
    for (const hash of hashes) {
      expect(hash).toMatch(/^'sha256-[A-Za-z0-9+/]{43}='$/);
    }
    expect(csp.get("connect-src")).toEqual(["'self'"]);
    // Safari applies it to http://localhost and breaks local dev; production doesn't need it.
    expect(csp.has("upgrade-insecure-requests")).toBe(false);

    // The button only works once React has hydrated, which needs every inline
    // script Next wrote to match a hash; guardConsole fails on any that didn't.
    await page.getByRole("button", { name: sampleButton }).click();
    await expect(page).toHaveURL(/\?sample=comfortable$/);
  });
}

test("injected inline script does not run", async ({ page }) => {
  allowErrors(/violates the following Content Security Policy directive/);
  await page.goto("/en");
  const result = await page.evaluate(async () => {
    const w = window as unknown as { injected?: boolean };
    const violations: string[] = [];
    document.addEventListener("securitypolicyviolation", (e) => {
      violations.push(`${e.effectiveDirective} ${e.blockedURI}`);
    });
    const div = document.createElement("div");
    // An upload's text rendered as HTML would look like this.
    div.innerHTML = `<img src="data:," onerror="window.injected = true"><a href="javascript:window.injected=true">x</a>`;
    // Positive control: the image does fail to load, so its handler would run without the CSP.
    const imageFailed = new Promise<boolean>((resolve) => {
      div.querySelector("img")?.addEventListener("error", () => {
        resolve(true);
      });
    });
    document.body.append(div);
    div.querySelector("a")?.click();
    const failed = await imageFailed;
    // Violation events are queued as tasks; wait until both arrive (or give up).
    for (let i = 0; i < 20 && violations.length < 2; i++) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return { injected: w.injected === true, imageFailed: failed, violations: violations.sort() };
  });
  expect(result.imageFailed).toBe(true);
  expect(result.injected).toBe(false);
  // Both payloads were blocked by script-src, not skipped for some other reason.
  expect(result.violations).toEqual(["script-src-attr inline", "script-src-elem inline"]);
});
