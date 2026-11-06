import { FIRST_MONTH_MAX_START_DAY } from "@/lib/constants";
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
  | { month: YearMonth; why: "starts-mid-month"; firstDate: string };

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
 * Excluded rows count as transactions for where the file starts, and their
 * totals are kept per month for the explanation view.
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
  const current = new Set<YearMonth>();
  let firstDate: string | undefined;

  for (const item of items) {
    const { date } = item.row;
    const month = monthOf(date);
    if (month >= reference) {
      current.add(month);
      continue;
    }
    // Stryker disable next-line EqualityOperator: equivalent; an equal date assigns the same value
    if (firstDate === undefined || date < firstDate) firstDate = date;
    let totals = byMonth.get(month);
    if (totals === undefined) {
      totals = emptyMonth(month);
      byMonth.set(month, totals);
    }
    addTo(totals, item);
  }

  const droppedMonths: DroppedMonth[] = [];
  const fullMonths: MonthTotals[] = [];
  if (firstDate !== undefined) {
    // Stryker disable next-line EqualityOperator: equivalent; map keys are unique, so a and b never tie
    const last = [...byMonth.keys()].reduce((a, b) => (b > a ? b : a));
    let month = monthOf(firstDate);
    if (Number(firstDate.slice(8, 10)) > FIRST_MONTH_MAX_START_DAY) {
      droppedMonths.push({ month, why: "starts-mid-month", firstDate });
      month = addMonths(month, 1);
    }
    for (; month <= last; month = addMonths(month, 1)) {
      fullMonths.push(byMonth.get(month) ?? emptyMonth(month));
    }
  }
  for (const month of [...current].sort()) droppedMonths.push({ month, why: "current" });
  return { fullMonths, droppedMonths };
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
