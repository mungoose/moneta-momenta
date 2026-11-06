import { DEFAULT_PERIOD_MONTHS, MIN_FULL_MONTHS, PERIOD_OPTIONS } from "@/lib/constants";
import { classify, type ExcludedReason } from "@/lib/import/classify";
import type { ParsedFile } from "@/lib/import/types";
import { divRound, sum, toCents, type Cents, type DecimalSeparator } from "@/lib/money/cents";
import { buildMonths, type DroppedMonth, type ExcludedTotal, type MonthTotals, type YearMonth } from "./months";

/** A category's average monthly net spending over the period. */
export interface CategoryAverage {
  category: string;
  avg: Cents;
}

/** A category group's average monthly net spending, with its categories, largest first. */
export interface GroupAverage {
  group: string;
  avg: Cents;
  categories: CategoryAverage[];
}

/** What the file says about the household's money over the chosen period. */
export interface DataSummary {
  /**
   * Every full month in the file, oldest first, not just the period's: the
   * plan's seasonal lookup reaches back up to a year whatever the period.
   */
  fullMonths: MonthTotals[];
  /** Months with rows that the averages leave out, oldest first. */
  droppedMonths: DroppedMonth[];
  /** The months the averages are over: the most recent full months, oldest first. */
  period: YearMonth[];
  avgIncome: Cents;
  avgSpending: Cents;
  /**
   * `avgIncome − avgSpending`: the difference of the two rounded averages
   * the user sees, so the shown numbers add up.
   */
  margin: Cents;
  /**
   * Spending per group and category over the period, largest first, ties by
   * name. Each average is rounded on its own, so the categories can differ
   * from their group's average by a cent or so.
   */
  byGroup: GroupAverage[];
  /** Rows in the period that count as neither income nor spending, per reason. */
  excluded: Record<ExcludedReason, ExcludedTotal>;
  /** Period months without any income; a warning, not an error. */
  noIncomeMonths: YearMonth[];
  decimal: DecimalSeparator;
}

/** Why a parsed file can't be summarised. */
export type BudgetError =
  /** Fewer than {@link MIN_FULL_MONTHS} full months. `droppedMonths` says which months were left out and why. */
  | { code: "too-little-data"; fullMonths: number; droppedMonths: DroppedMonth[] }
  /** The period's income totals zero or less: usually income isn't in the income group. */
  | { code: "no-income" };

/** A summary, or why there can't be one. */
export type SummaryResult = { ok: true; summary: DataSummary } | { ok: false; error: BudgetError };

/**
 * The period lengths the user can pick for this much data. Lengths longer
 * than the data are left out, so the UI can disable them.
 * @param fullMonthCount  Number of full months in the file.
 * @returns               The available lengths, shortest first.
 * @example periodOptions(7) // [3, 6]
 */
export function periodOptions(fullMonthCount: number): number[] {
  return PERIOD_OPTIONS.filter((length) => length <= fullMonthCount);
}

/**
 * The period length to start with: {@link DEFAULT_PERIOD_MONTHS}, or every
 * full month when there are fewer (the UI notes that).
 * @param fullMonthCount  Number of full months in the file, at least {@link MIN_FULL_MONTHS}.
 * @returns               The period length in months.
 * @example defaultPeriodLength(4) // 4
 */
export function defaultPeriodLength(fullMonthCount: number): number {
  return Math.min(DEFAULT_PERIOD_MONTHS, fullMonthCount);
}

/**
 * Turns a parsed file into monthly averages over a period of recent full months.
 * @param file          The parsed file.
 * @param reference     The first unfinished month (see `buildMonths`).
 * @param periodLength  Months to average over, counted back from the last full
 *                      month. Defaults to {@link defaultPeriodLength}.
 * @returns             The summary, or `too-little-data` / `no-income`.
 * @throws {RangeError} When `periodLength` isn't a whole number between
 *                      {@link MIN_FULL_MONTHS} and the number of full months
 *                      (the UI only offers valid lengths), or a total leaves
 *                      the safe-integer range.
 */
export function summarise(file: ParsedFile, reference: YearMonth, periodLength?: number): SummaryResult {
  const { fullMonths, droppedMonths } = buildMonths(file.rows.map(classify), reference);
  if (fullMonths.length < MIN_FULL_MONTHS) {
    return { ok: false, error: { code: "too-little-data", fullMonths: fullMonths.length, droppedMonths } };
  }
  const length = periodLength ?? defaultPeriodLength(fullMonths.length);
  if (!Number.isInteger(length) || length < MIN_FULL_MONTHS || length > fullMonths.length) {
    // Stryker disable next-line StringLiteral: diagnostic text only; tests assert the error type
    throw new RangeError(`Period of ${length} months isn't available for ${fullMonths.length} full months`);
  }
  const months = fullMonths.slice(-length);

  const totalIncome = sum(months.map((m) => m.income));
  if (totalIncome <= 0) return { ok: false, error: { code: "no-income" } };
  const average = (total: Cents) => toCents(divRound(total, length));
  const avgIncome = average(totalIncome);
  const avgSpending = average(sum(months.map((m) => m.spending)));

  return {
    ok: true,
    summary: {
      fullMonths,
      droppedMonths,
      period: months.map((m) => m.month),
      avgIncome,
      avgSpending,
      margin: toCents(avgIncome - avgSpending),
      byGroup: groupAverages(months, average),
      excluded: excludedTotals(months),
      noIncomeMonths: months.filter((m) => m.income === 0).map((m) => m.month),
      decimal: file.decimal,
    },
  };
}

/** Largest first; ties by name, so the order doesn't depend on the file's row order. */
const byAvgThenName =
  <T extends { avg: Cents }>(name: (item: T) => string) =>
  (a: T, b: T) =>
    // Stryker disable next-line EqualityOperator: equivalent; group names, and category names within a group, are unique
    b.avg - a.avg || (name(a) < name(b) ? -1 : 1);

/** Averages each group and category over the period's months. */
function groupAverages(months: readonly MonthTotals[], average: (total: Cents) => Cents): GroupAverage[] {
  const totals = new Map<string, Map<string, Cents>>();
  for (const month of months) {
    for (const [group, categories] of month.groups) {
      let entry = totals.get(group);
      if (entry === undefined) {
        entry = new Map();
        totals.set(group, entry);
      }
      for (const [category, net] of categories) entry.set(category, toCents((entry.get(category) ?? 0) + net));
    }
  }
  return [...totals]
    .map(([group, categories]) => ({
      group,
      avg: average(sum([...categories.values()])),
      categories: [...categories]
        .map(([category, total]) => ({ category, avg: average(total) }))
        .sort(byAvgThenName((c) => c.category)),
    }))
    .sort(byAvgThenName((g) => g.group));
}

/** Adds up the period months' excluded rows per reason. */
function excludedTotals(months: readonly MonthTotals[]): Record<ExcludedReason, ExcludedTotal> {
  const reasons = ["transfer", "opening-balance", "card-payment", "uncategorised"] as const;
  const entries = reasons.map((reason) => {
    const parts = months.map((m) => m.excluded[reason]);
    return [reason, { count: parts.reduce((n, p) => n + p.count, 0), total: sum(parts.map((p) => p.total)) }] as const;
  });
  return Object.fromEntries(entries) as Record<ExcludedReason, ExcludedTotal>;
}
