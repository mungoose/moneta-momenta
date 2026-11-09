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

/** Day and month in English; Estonian builds its inflected form from {@link ET_MONTH_GENITIVE} instead. */
const enDayFormatter = new Intl.DateTimeFormat(INTL_LOCALE.en, { day: "numeric", month: "long", timeZone: "UTC" });

/**
 * The word that joins a list's last item. Lists are joined here rather than by `Intl.ListFormat` because browsers
 * disagree: Safari's en-IE data adds a comma before "and". The server renders the landing's column list, so a
 * browser that formats it differently breaks React's hydration of the page.
 */
const LIST_AND: Record<Locale, string> = { en: "and", et: "ja" };

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
  // Irish English shortens September to "Sept"; three letters like every other month keeps the table column even.
  // Estonian's lowercase "sept" never matches.
  return monthFormatters[locale][style].format(date).replace("Sept ", "Sep ");
}

/**
 * Estonian month names in the genitive, January first. `Intl` only gives the
 * nominative ("oktoober"), but Estonian inflects a month inside a sentence:
 * "11. oktoobril" (on 11 October), "oktoobri kulud" (October's spending).
 */
const ET_MONTH_GENITIVE = [
  "jaanuari",
  "veebruari",
  "märtsi",
  "aprilli",
  "mai",
  "juuni",
  "juuli",
  "augusti",
  "septembri",
  "oktoobri",
  "novembri",
  "detsembri",
] as const;

/** The Estonian genitive of a month, from its 1-based number. */
function etGenitive(monthNumber: number): string {
  return ET_MONTH_GENITIVE[monthNumber - 1] ?? "";
}

/**
 * Formats an ISO date for "on <date>" in a sentence ("Your transactions stop on …").
 * @param date    ISO date, `YYYY-MM-DD`.
 * @param locale  UI locale.
 * @returns       E.g. `11 October` (en), `11. oktoobril` (et, the adessive case).
 * @example formatOnDay("2026-10-11", "et") // "11. oktoobril"
 */
export function formatOnDay(date: string, locale: Locale): string {
  if (locale === "et") {
    return `${Number(date.slice(8, 10))}. ${etGenitive(Number(date.slice(5, 7)))}l`;
  }
  const utc = new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10))));
  return enDayFormatter.format(utc);
}

/**
 * Formats a month for "of <month>" in a sentence ("some of the spending in …").
 * @param month   The month.
 * @param locale  UI locale.
 * @returns       E.g. `October 2026` (en), `2026. aasta oktoobri` (et, the genitive case).
 * @example formatOfMonth("2026-10", "et") // "2026. aasta oktoobri"
 */
export function formatOfMonth(month: YearMonth, locale: Locale): string {
  if (locale === "et") {
    return `${month.slice(0, 4)}. aasta ${etGenitive(Number(month.slice(5, 7)))}`;
  }
  return formatMonth(month, locale);
}

/**
 * Joins names into a sentence list, with the locale's "and".
 * @param items   The names, in order.
 * @param locale  UI locale.
 * @returns       E.g. `Payee, Category and Inflow` (en), `Payee, Category ja Inflow` (et).
 * @example formatList(["Date", "Payee"], "en") // "Date and Payee"
 */
export function formatList(items: readonly string[], locale: Locale): string {
  const last = items.at(-1);
  if (last === undefined) {
    return "";
  }
  // Neither locale puts a comma before its "and".
  return items.length === 1 ? last : `${items.slice(0, -1).join(", ")} ${LIST_AND[locale]} ${last}`;
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
