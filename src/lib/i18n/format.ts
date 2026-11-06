import type { YearMonth } from "@/lib/budget/months";
import { INTL_LOCALE, LOCALES, type Locale } from "./index";

/** How much of a month name to show: `long` in sentences, `short` in the month table. */
export type MonthStyle = "long" | "short";

/** One formatter per locale and style; constructing them is the expensive part. */
const monthFormatters = Object.fromEntries(
  LOCALES.map((locale) => [
    locale,
    {
      // UTC both ways, so the 1st of a month never shifts into the previous one.
      long: new Intl.DateTimeFormat(INTL_LOCALE[locale], { month: "long", year: "numeric", timeZone: "UTC" }),
      short: new Intl.DateTimeFormat(INTL_LOCALE[locale], { month: "short", year: "numeric", timeZone: "UTC" }),
    },
  ]),
) as Record<Locale, Record<MonthStyle, Intl.DateTimeFormat>>;

const numberFormatters = Object.fromEntries(
  LOCALES.map((locale) => [locale, new Intl.NumberFormat(INTL_LOCALE[locale], { maximumFractionDigits: 2 })]),
) as Record<Locale, Intl.NumberFormat>;

/**
 * Formats a `YYYY-MM` month for display.
 * @param month   The month.
 * @param locale  UI locale.
 * @param style   `long` (default) or `short`.
 * @returns       E.g. `July 2027` / `Jul 2027` (en), `juuli 2027` (et).
 * @example formatMonth("2027-07", "en", "short") // "Jul 2027"
 */
export function formatMonth(month: YearMonth, locale: Locale, style: MonthStyle = "long"): string {
  const date = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1));
  return monthFormatters[locale][style].format(date);
}

/**
 * Formats a count or other plain number with the locale's grouping.
 * @param value   The number.
 * @param locale  UI locale.
 * @returns       E.g. `1,284` (en) or `1284` (et).
 * @example formatNumber(1284, "en") // "1,284"
 */
export function formatNumber(value: number, locale: Locale): string {
  return numberFormatters[locale].format(value);
}

/**
 * Formats basis points as a percentage number, without the `%` sign (the copy adds it).
 * Passed to `Intl` as an exact decimal string, so no float division is involved.
 * @param bps     Basis points, 0 or more.
 * @param locale  UI locale.
 * @returns       E.g. `9.9` (en) or `9,9` (et).
 * @example formatPercent(990, "et") // "9,9"
 */
export function formatPercent(bps: number, locale: Locale): string {
  const digits = String(bps).padStart(3, "0");
  return numberFormatters[locale].format(`${digits.slice(0, -2)}.${digits.slice(-2)}` as `${number}`);
}
