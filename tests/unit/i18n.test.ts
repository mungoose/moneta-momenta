import { describe, expect, it } from "vitest";
import { DEFAULT_LOCALE, LOCALES, getMessages, isLocale } from "@/lib/i18n";

/** Collects dotted key paths of a nested dictionary, e.g. `landing.tagline`. */
function keyPaths(obj: object, prefix = ""): string[] {
  return Object.entries(obj as Record<string, unknown>).flatMap(([key, value]) =>
    typeof value === "object" && value !== null ? keyPaths(value, `${prefix}${key}.`) : [`${prefix}${key}`],
  );
}

describe("i18n", () => {
  it("every locale has exactly the English keys and no empty strings", () => {
    const reference = keyPaths(getMessages("en")).sort();
    for (const locale of LOCALES) {
      const messages = getMessages(locale);
      expect(keyPaths(messages).sort()).toEqual(reference);
      for (const path of reference) {
        const value = path.split(".").reduce<unknown>((node, key) => (node as Record<string, unknown>)[key], messages);
        expect(value, `${locale}: ${path}`).toMatch(/\S/);
      }
    }
  });

  it("recognises supported locales only", () => {
    expect(isLocale("en")).toBe(true);
    expect(isLocale("et")).toBe(true);
    expect(isLocale("lv")).toBe(false);
    expect(isLocale("")).toBe(false);
    expect(isLocale(DEFAULT_LOCALE)).toBe(true);
  });
});
