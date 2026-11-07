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

const dayFormatters = Object.fromEntries(
  LOCALES.map((locale) => [
    locale,
    new Intl.DateTimeFormat(INTL_LOCALE[locale], { day: "numeric", month: "long", timeZone: "UTC" }),
  ]),
) as Record<Locale, Intl.DateTimeFormat>;

const listFormatters = Object.fromEntries(
  LOCALES.map((locale) => [locale, new Intl.ListFormat(INTL_LOCALE[locale], { type: "conjunction" })]),
) as Record<Locale, Intl.ListFormat>;

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
 * Formats an ISO date as day and month, for sentences where the month and
 * year are already clear.
 * @param date    ISO date, `YYYY-MM-DD`.
 * @param locale  UI locale.
 * @returns       E.g. `12 October` (en), `12. oktoober` (et).
 * @example formatDay("2026-10-12", "en") // "12 October"
 */
export function formatDay(date: string, locale: Locale): string {
  const utc = new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10))));
  return dayFormatters[locale].format(utc);
}

/**
 * Joins names into a sentence list, with the locale's "and".
 * @param items   The names, in order.
 * @param locale  UI locale.
 * @returns       E.g. `Payee, Category and Inflow` (en), `Payee, Category ja Inflow` (et).
 * @example formatList(["Date", "Payee"], "en") // "Date and Payee"
 */
export function formatList(items: readonly string[], locale: Locale): string {
  return listFormatters[locale].format(items);
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
