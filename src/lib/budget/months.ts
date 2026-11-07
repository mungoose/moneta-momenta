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

/** A month that has rows but isn't used for the averages: the reference month or later, not finished yet. */
export interface DroppedMonth {
  month: YearMonth;
  why: "current";
}

/**
 * A month at the edge of the file that is used, but may be missing
 * transactions. It's a warning, not a reason to drop the month: a quiet week
 * (a trip paid by an employer's card, a hospital stay) looks the same as a cut
 * export, and only the user can tell which it is.
 */
export type IncompleteMonth =
  /** The file's first month, whose earliest row is late in the month. */
  | { month: YearMonth; why: "starts-mid-month"; firstDate: string }
  /** The file's last month before the reference month, whose latest row is early in the month. */
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
 * Groups classified rows into calendar months and decides which months count.
 * The file has no month markers, so this works from dates alone:
 * - The range runs from the earliest row's month to the latest one before
 *   `reference`, with no gaps. A month in it without rows is a real zero.
 * - Months at or after `reference` are unfinished and dropped.
 * - The first month is flagged when its earliest row is after
 *   {@link FIRST_MONTH_MAX_START_DAY}: the export may start mid-month.
 * - The last month is flagged when its latest row is before its last
 *   {@link LAST_MONTH_END_WINDOW_DAYS} days and the file has no rows after
 *   it: the export may end mid-month.
 * Flagged months still count; the flag lets the UI say the averages may be
 * off. Excluded rows count as transactions for where the file starts and
 * ends, and their totals are kept per month for the explanation view.
 * @param items      Every classified row of the file, in any order.
 * @param reference  The first unfinished month: today's month for an upload,
 *                   a fixed month for the sample so it never goes stale.
 * @returns          The months that count, oldest first; the dropped months
 *                   that have rows, oldest first; and the flagged edge
 *                   months, the first month's flag before the last's.
 * @throws {RangeError} When a month's total leaves the safe-integer range.
 */
export function buildMonths(
  items: readonly Classified[],
  reference: YearMonth,
): { fullMonths: MonthTotals[]; droppedMonths: DroppedMonth[]; incomplete: IncompleteMonth[] } {
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

  const droppedMonths = [...currentMonths].sort().map((month): DroppedMonth => ({ month, why: "current" }));
  // ISO dates sort chronologically as strings.
  dates.sort();
  const firstDate = dates[0];
  if (firstDate === undefined) {
    return { fullMonths: [], droppedMonths, incomplete: [] };
  }
  // Never undefined here: `dates` has at least the first date.
  const lastDate = dates.at(-1) ?? firstDate;
  const fullMonths: MonthTotals[] = [];
  for (let month = monthOf(firstDate); month <= monthOf(lastDate); month = addMonths(month, 1)) {
    fullMonths.push(byMonth.get(month) ?? emptyMonth(month));
  }
  // Rows after the last month show the export went past its end, so its end isn't judged.
  return { fullMonths, droppedMonths, incomplete: edgeFlags(firstDate, lastDate, droppedMonths.length === 0) };
}

/**
 * Flags the file's first and last month when they may be missing transactions.
 * @param firstDate  The file's earliest date before the reference month.
 * @param lastDate   Its latest date before the reference month.
 * @param judgeEnd   Whether to judge the end: false when later rows show the
 *                   export went past it.
 */
function edgeFlags(firstDate: string, lastDate: string, judgeEnd: boolean): IncompleteMonth[] {
  const flags: IncompleteMonth[] = [];
  if (dayOf(firstDate) > FIRST_MONTH_MAX_START_DAY) {
    flags.push({ month: monthOf(firstDate), why: "starts-mid-month", firstDate });
  }
  if (judgeEnd && endsEarly(lastDate)) {
    flags.push({ month: monthOf(lastDate), why: "ends-mid-month", lastDate });
  }
  return flags;
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
