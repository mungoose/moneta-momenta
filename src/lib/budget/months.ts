import { FIRST_MONTH_MAX_START_DAY, LAST_MONTH_END_WINDOW_DAYS } from "@/lib/constants";
import type { Classified, ExcludedReason } from "@/lib/import/classify";
import { toCents, type Cents } from "@/lib/money/cents";

/** A calendar month, `YYYY-MM`. Compares correctly as a string. */
export type YearMonth = string;

/** How many excluded rows there were and how much money they moved. */
export interface ExcludedTotal {
  count: number;
  /** Sum of each row's outflow plus inflow: the money the rows moved, whichever direction. */
  total: Cents;
}

/** One full month's income, spending and left-out rows. */
export interface MonthTotals {
  month: YearMonth;
  /** Net income: inflow − outflow of income rows. */
  income: Cents;
  /** Net spending over all categories; refunds lower it. */
  spending: Cents;
  /**
   * Net spending per category group, then per category. Maps, not plain
   * objects, because the names come from the user's file and `__proto__`
   * is a valid category name.
   */
  groups: Map<string, Map<string, Cents>>;
  excluded: Record<ExcludedReason, ExcludedTotal>;
}

/** A month that has rows but isn't used for the averages, and why. */
export type DroppedMonth =
  /** The reference month or later: not finished yet. */
  | { month: YearMonth; why: "current" }
  /** The file's first month, which starts too late to be complete. */
  | { month: YearMonth; why: "starts-mid-month"; firstDate: string }
  /** The file's last month before the reference month, which ends too early to be complete. */
  | { month: YearMonth; why: "ends-mid-month"; lastDate: string };

/**
 * The month an ISO date falls in.
 * @param date  ISO date, `YYYY-MM-DD`.
 * @returns     Its month, `YYYY-MM`.
 * @example monthOf("2026-07-31") // "2026-07"
 */
export function monthOf(date: string): YearMonth {
  return date.slice(0, 7);
}

/**
 * Moves a month forwards or backwards.
 * @param month  `YYYY-MM`, year 0000–9999.
 * @param count  Months to add; negative goes back.
 * @returns      The resulting month, `YYYY-MM`.
 * @example addMonths("2026-12", 1)  // "2027-01"
 * @example addMonths("2026-01", -1) // "2025-12"
 */
export function addMonths(month: YearMonth, count: number): YearMonth {
  const index = Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1 + count;
  // Calendar arithmetic on a month count, not money, so plain division is right here.
  // eslint-disable-next-line no-restricted-syntax
  const year = Math.floor(index / 12);
  return `${String(year).padStart(4, "0")}-${String(index - year * 12 + 1).padStart(2, "0")}`;
}

/** A month with nothing in it yet; also what a month without rows stays. */
const emptyMonth = (month: YearMonth): MonthTotals => ({
  month,
  income: 0 as Cents,
  spending: 0 as Cents,
  groups: new Map(),
  excluded: {
    transfer: { count: 0, total: 0 as Cents },
    "opening-balance": { count: 0, total: 0 as Cents },
    "card-payment": { count: 0, total: 0 as Cents },
    uncategorised: { count: 0, total: 0 as Cents },
  },
});

/** Adds two amounts, throwing rather than silently losing cents past 2^53. */
const add = (a: Cents, b: number): Cents => toCents(a + b);

/**
 * Groups classified rows into calendar months and decides which months are
 * full. The file has no month markers, so this works from dates alone:
 * - The range runs from the earliest row's month to the latest one before
 *   `reference`, with no gaps. A month in it without rows is a real zero.
 * - Months at or after `reference` are unfinished and dropped.
 * - The first month is dropped when its earliest row is after
 *   {@link FIRST_MONTH_MAX_START_DAY}: the export probably starts mid-month.
 * - The last month is dropped when its latest row is before its last
 *   {@link LAST_MONTH_END_WINDOW_DAYS} days and the file has no rows after
 *   it: the export probably ends mid-month. A single month is judged by its
 *   start first, so it's reported once.
 * Excluded rows count as transactions for where the file starts and ends,
 * and their totals are kept per month for the explanation view.
 * @param items      Every classified row of the file, in any order.
 * @param reference  The first unfinished month: today's month for an upload,
 *                   a fixed month for the sample so it never goes stale.
 * @returns          The full months, oldest first, and the dropped months that have rows, oldest first.
 * @throws {RangeError} When a month's total leaves the safe-integer range.
 */
export function buildMonths(
  items: readonly Classified[],
  reference: YearMonth,
): { fullMonths: MonthTotals[]; droppedMonths: DroppedMonth[] } {
  const byMonth = new Map<YearMonth, MonthTotals>();
  const currentMonths = new Set<YearMonth>();
  const dates: string[] = [];

  for (const item of items) {
    const { date } = item.row;
    const month = monthOf(date);
    if (month >= reference) {
      currentMonths.add(month);
      continue;
    }
    dates.push(date);
    let totals = byMonth.get(month);
    if (totals === undefined) {
      totals = emptyMonth(month);
      byMonth.set(month, totals);
    }
    addTo(totals, item);
  }

  const current = [...currentMonths].sort().map((month): DroppedMonth => ({ month, why: "current" }));
  // ISO dates sort chronologically as strings.
  dates.sort();
  const firstDate = dates[0];
  if (firstDate === undefined) {
    return { fullMonths: [], droppedMonths: current };
  }
  // Never undefined here: `dates` has at least the first date.
  const lastDate = dates.at(-1) ?? firstDate;
  // Rows after the last month show the export went past its end, so its end isn't judged.
  const { fullMonths, cut } = fullRange(byMonth, firstDate, lastDate, current.length === 0);
  return { fullMonths, droppedMonths: [...cut, ...current] };
}

/**
 * Lays out the months from the file's first month to its last, with empty
 * months for the gaps, leaving out an incomplete first or last month (oldest
 * first in `cut`).
 * @param firstDate  The file's earliest date before the reference month.
 * @param lastDate   Its latest date before the reference month.
 * @param judgeEnd   Whether the last month may end early: false when later
 *                   rows show the export went past its end.
 */
function fullRange(
  byMonth: ReadonlyMap<YearMonth, MonthTotals>,
  firstDate: string,
  lastDate: string,
  judgeEnd: boolean,
): { fullMonths: MonthTotals[]; cut: DroppedMonth[] } {
  const cut: DroppedMonth[] = [];
  let month = monthOf(firstDate);
  if (dayOf(firstDate) > FIRST_MONTH_MAX_START_DAY) {
    cut.push({ month, why: "starts-mid-month", firstDate });
    month = addMonths(month, 1);
  }
  let last = monthOf(lastDate);
  if (judgeEnd && last >= month && endsEarly(lastDate)) {
    cut.push({ month: last, why: "ends-mid-month", lastDate });
    last = addMonths(last, -1);
  }
  const fullMonths: MonthTotals[] = [];
  for (; month <= last; month = addMonths(month, 1)) {
    fullMonths.push(byMonth.get(month) ?? emptyMonth(month));
  }
  return { fullMonths, cut };
}

/** The day of the month of an ISO date. */
const dayOf = (date: string) => Number(date.slice(8, 10));

/** Whether a month's latest date is before the month's last {@link LAST_MONTH_END_WINDOW_DAYS} days. */
function endsEarly(lastDate: string): boolean {
  // Day 0 of the next month is the last day of this one.
  const daysInMonth = new Date(Date.UTC(Number(lastDate.slice(0, 4)), Number(lastDate.slice(5, 7)), 0)).getUTCDate();
  return dayOf(lastDate) <= daysInMonth - LAST_MONTH_END_WINDOW_DAYS;
}

/** Adds one classified row to its month's totals. */
function addTo(totals: MonthTotals, item: Classified): void {
  switch (item.kind) {
    case "income":
      totals.income = add(totals.income, item.amount);
      return;
    case "spending": {
      totals.spending = add(totals.spending, item.net);
      let group = totals.groups.get(item.group);
      if (group === undefined) {
        group = new Map();
        totals.groups.set(item.group, group);
      }
      group.set(item.category, add(group.get(item.category) ?? (0 as Cents), item.net));
      return;
    }
    case "excluded": {
      const entry = totals.excluded[item.reason];
      entry.count += 1;
      entry.total = add(entry.total, add(item.row.outflow, item.row.inflow));
      return;
    }
  }
}
