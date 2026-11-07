import { en, type Messages } from "./en";
import { et } from "./et";

/** Supported UI locales, in the order they're offered. */
export const LOCALES = ["en", "et"] as const;

/** A supported UI locale code. */
export type Locale = (typeof LOCALES)[number];

const dictionaries: Record<Locale, Messages> = { en, et };

/**
 * Narrows an arbitrary route segment to a supported locale.
 * @param value  Raw `[locale]` route parameter.
 * @returns      `true` when `value` is one of {@link LOCALES}.
 */
export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

/**
 * Returns the UI dictionary for a locale.
 * @param locale  A supported locale.
 */
export function getMessages(locale: Locale): Messages {
  return dictionaries[locale];
}

/**
 * BCP 47 tag passed to `Intl` formatters. Kept separate from the route locale
 * so formatting can be tuned (e.g. `en-IE` for euro-style English) without
 * changing URLs.
 */
export const INTL_LOCALE: Record<Locale, string> = { en: "en-IE", et: "et-EE" };

export type { Messages };
