import { addMonths, type MonthTotals, type YearMonth } from "@/lib/budget/months";
import type { DataSummary } from "@/lib/budget/summary";
import { BUFFER_BPS } from "@/lib/constants";
import { divRound, toCents, type Cents } from "@/lib/money/cents";

/** How one plan month comes out; the verdict uses the same scale. */
export type Status = "fits" | "tight" | "no-fit";

/** The fields every plan month has, whatever its spending is based on. */
interface PlanMonthBase {
  month: YearMonth;
  instalment: Cents;
  /** Spending this month is expected to have. */
  expectedSpending: Cents;
  /** `avgIncome − expectedSpending`. */
  margin: Cents;
  /** `margin − instalment`. */
  leftover: Cents;
  /**
   * Savings carried into this month: what earlier plan months left above the
   * buffer, less the shortfalls they covered. Zero again after a shortfall
   * they couldn't cover.
   */
  savedBefore: Cents;
  /** The leftover is below zero, but `savedBefore` covers it, so the month is tight rather than no-fit. */
  covered: boolean;
  status: Status;
}

/**
 * One month of the plan. Spending is the average, unless the same calendar
 * month cost more last time (`seasonal`); then it's that month's spending.
 */
export type PlanMonth = PlanMonthBase &
  (
    | { spendingSource: "average" }
    /** `seasonalMonth`: the past month whose spending is used, for "Last July you spent…". */
    | { spendingSource: "seasonal"; seasonalMonth: YearMonth }
  );

/** The month-by-month result of a plan and its overall verdict. */
export interface Affordability {
  /** Leftover below this makes a month tight. */
  buffer: Cents;
  months: PlanMonth[];
  /** From {@link verdictOf}: the worst month's status, except that one short month among fitting ones is tight. */
  verdict: Status;
}

/** The parts of a {@link DataSummary} the plan needs. */
export type PlanBudget = Pick<DataSummary, "avgIncome" | "avgSpending" | "fullMonths">;

/**
 * The leftover a month needs to count as fitting: {@link BUFFER_BPS} of average income.
 * @param avgIncome  Average monthly income.
 * @returns          The buffer, rounded half up to a cent.
 * @throws {RangeError} When `avgIncome × BUFFER_BPS` isn't a safe integer.
 * @example bufferFor(253713) // 25371: 10% of €2,537.13
 */
export function bufferFor(avgIncome: Cents): Cents {
  return toCents(divRound(avgIncome * BUFFER_BPS, 10_000));
}

/**
 * Classifies one month's leftover.
 * @param leftover  What is left after spending and the instalment.
 * @param buffer    From {@link bufferFor}.
 * @returns         `fits` at or above the buffer, `tight` from 0 up to it, `no-fit` below 0.
 * @example statusOf(0, 25371) // "tight"
 */
export function statusOf(leftover: Cents, buffer: Cents): Status {
  if (leftover >= buffer) {
    return "fits";
  }
  return leftover >= 0 ? "tight" : "no-fit";
}

/**
 * Works out every plan month and the verdict. Income stays at the average.
 * Spending is `max(avgSpending, that calendar month's most recent actual
 * spending)`: a known expensive month makes the plan month worse, a cheap one
 * never makes it look better. The lookup uses every full month, not just the
 * averaging period. Full months run without gaps, so each calendar month's
 * most recent occurrence is within the last 12 of them.
 *
 * Months aren't judged alone: what a month leaves above the buffer is saved,
 * and a later month that comes up short is covered from it (see {@link carry}).
 * @param budget       Averages and full months, from `summarise`.
 * @param instalments  From `buildSchedule`; the first is due the month after `reference`.
 * @param reference    The first unfinished month, the same one the summary used.
 * @returns            One {@link PlanMonth} per instalment, the buffer and the verdict.
 * @throws {RangeError} When an amount leaves the safe-integer range.
 */
export function assessPlan(budget: PlanBudget, instalments: readonly Cents[], reference: YearMonth): Affordability {
  const buffer = bufferFor(budget.avgIncome);
  const latest = latestByCalendarMonth(budget.fullMonths);
  let saved = toCents(0);
  const months = instalments.map((instalment, i) => {
    const month = addMonths(reference, i + 1);
    const row = carry(planMonth(budget, month, instalment, latest.get(calendarMonth(month))), buffer, saved);
    saved = row.savedAfter;
    return row.month;
  });
  return { buffer, months, verdict: verdictOf(months.map((m) => m.status)) };
}

/**
 * The verdict from the months' statuses: the worst month's, with one exception.
 * A single month that doesn't fit, when every other month fits, makes the plan
 * tight: one bad month is something to plan for, not a reason to refuse a plan
 * that is comfortable the rest of the time. With any other month tight or short,
 * the worst month decides.
 * @param statuses  Every plan month's status.
 * @returns         The verdict.
 * @example verdictOf(["fits", "no-fit", "fits"]) // "tight"
 * @example verdictOf(["fits", "no-fit", "tight"]) // "no-fit"
 */
export function verdictOf(statuses: readonly Status[]): Status {
  const count = (status: Status) => statuses.filter((s) => s === status).length;
  if (count("no-fit") === 1 && count("tight") === 0 && count("fits") > 0) {
    return "tight";
  }
  return worst(statuses);
}

/** `MM` of a `YYYY-MM` month. */
const calendarMonth = (month: YearMonth) => month.slice(5);

/** Each calendar month's most recent full month. `fullMonths` is oldest first, so later ones overwrite. */
function latestByCalendarMonth(fullMonths: readonly MonthTotals[]): Map<string, MonthTotals> {
  return new Map(fullMonths.map((m) => [calendarMonth(m.month), m]));
}

/** A plan month before savings are applied: its own sum, judged alone. */
type Unsaved = Omit<PlanMonthBase, "savedBefore" | "covered" | "status"> &
  ({ spendingSource: "average" } | { spendingSource: "seasonal"; seasonalMonth: YearMonth });

/** One plan month's sum, from the budget and that calendar month's last occurrence, if any. */
function planMonth(budget: PlanBudget, month: YearMonth, instalment: Cents, past: MonthTotals | undefined): Unsaved {
  const row = (expectedSpending: Cents) => {
    const margin = toCents(budget.avgIncome - expectedSpending);
    return { month, instalment, expectedSpending, margin, leftover: toCents(margin - instalment) };
  };
  if (past !== undefined && past.spending > budget.avgSpending) {
    return { ...row(past.spending), spendingSource: "seasonal", seasonalMonth: past.month };
  }
  return { ...row(budget.avgSpending), spendingSource: "average" };
}

/**
 * Applies the savings to one month and works out what carries on. A fitting
 * month saves what it leaves above the buffer; the buffer itself stays for the
 * unexpected. A tight month neither saves nor draws. A short month draws its
 * shortfall when the savings cover it, and is then tight; when they don't, it
 * doesn't fit and uses them all up.
 */
function carry(month: Unsaved, buffer: Cents, saved: Cents): { month: PlanMonth; savedAfter: Cents } {
  const status = statusOf(month.leftover, buffer);
  if (status === "fits") {
    const savedAfter = toCents(saved + month.leftover - buffer);
    return { month: { ...month, savedBefore: saved, covered: false, status }, savedAfter };
  }
  if (status === "tight") {
    return { month: { ...month, savedBefore: saved, covered: false, status }, savedAfter: saved };
  }
  const covered = saved + month.leftover >= 0;
  return {
    month: { ...month, savedBefore: saved, covered, status: covered ? "tight" : "no-fit" },
    savedAfter: covered ? toCents(saved + month.leftover) : toCents(0),
  };
}

/** The worst of the statuses: any `no-fit` wins, then any `tight`. */
function worst(statuses: readonly Status[]): Status {
  if (statuses.includes("no-fit")) {
    return "no-fit";
  }
  return statuses.includes("tight") ? "tight" : "fits";
}
