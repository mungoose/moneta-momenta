import { INTL_LOCALE, type Locale } from "@/lib/i18n";
import type { Cents } from "./cents";

/** One formatter per locale: constructing `Intl.NumberFormat` is the expensive part. */
const formatters: Record<Locale, Intl.NumberFormat> = {
  en: new Intl.NumberFormat(INTL_LOCALE.en, { style: "currency", currency: "EUR" }),
  et: new Intl.NumberFormat(INTL_LOCALE.et, { style: "currency", currency: "EUR" }),
};

/**
 * Formats cents as euros for display, in the locale's own style.
 * The value goes to `Intl` as an exact decimal string (`"2465.87"`), not as
 * `cents / 100`, so even the largest safe amount formats without float error.
 * @param value   Amount in cents.
 * @param locale  UI locale.
 * @returns       E.g. `€2,465.87` (en) or `2465,87 €` (et; no-break spaces). Negatives use U+2212 minus in both.
 * @example formatCents(toCents(120000), "en") // "€1,200.00"
 * @example formatCents(toCents(-649), "et")   // "−6,49 €"
 * @example formatCents(toCents(-649), "en")   // "−€6.49"
 */
export function formatCents(value: Cents, locale: Locale): string {
  const digits = String(Math.abs(value)).padStart(3, "0");
  const sign = value < 0 ? "-" : "";
  const decimal = `${sign}${digits.slice(0, -2)}.${digits.slice(-2)}` as `${number}`;
  // Irish English writes a hyphen, which reads as a dash in a sentence; a true minus is what Estonian already gets.
  return formatters[locale].format(decimal).replace("-", "\u2212");
}
