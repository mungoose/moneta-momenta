import { describe, expect, it } from "vitest";
import { LOCALES, getMessages, isLocale } from "@/lib/i18n";

/** Collects dotted key paths of a nested dictionary, e.g. `landing.tagline`. */
function keyPaths(obj: object, prefix = ""): string[] {
  return Object.entries(obj as Record<string, unknown>).flatMap(([key, value]) =>
    typeof value === "object" && value !== null ? keyPaths(value, `${prefix}${key}.`) : [`${prefix}${key}`],
  );
}

describe("i18n", () => {
  it("every locale has exactly the English keys, no empty strings and the same message parameters", () => {
    const en = getMessages("en");
    const reference = keyPaths(en).sort();
    const at = (messages: object, path: string) =>
      path.split(".").reduce<unknown>((node, key) => (node as Record<string, unknown>)[key], messages);
    for (const locale of LOCALES) {
      const messages = getMessages(locale);
      expect(keyPaths(messages).sort()).toEqual(reference);
      for (const path of reference) {
        const value = at(messages, path);
        if (typeof value === "function") {
          // Messages with values are functions; same arity means no value is silently dropped.
          expect(value.length, `${locale}: ${path}`).toBe((at(en, path) as (...args: never[]) => string).length);
          const sample = (value as (...args: string[]) => string)(...Array<string>(value.length).fill("1"));
          expect(sample, `${locale}: ${path}`).toMatch(/\S/);
        } else {
          expect(value, `${locale}: ${path}`).toMatch(/\S/);
        }
      }
    }
  });

  it("recognises supported locales only", () => {
    expect(isLocale("en")).toBe(true);
    expect(isLocale("et")).toBe(true);
    expect(isLocale("lv")).toBe(false);
    expect(isLocale("")).toBe(false);
  });
});
