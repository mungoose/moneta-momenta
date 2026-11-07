import { IRREGULAR_MIN_GAP_CENTS, IRREGULAR_PEAK_RATIO } from "@/lib/constants";
import { divRound, toCents, type Cents } from "@/lib/money/cents";
import type { MonthTotals, YearMonth } from "./months";

/** How a category's or payee's biggest month compares with its usual one. */
interface Peak {
  /** The biggest monthly net in the period. */
  peak: Cents;
  /** The month of {@link peak}; the most recent one when several tie. */
  peakMonth: YearMonth;
  /** The median monthly net in the period, months without rows counted as zero. */
  median: Cents;
}

/**
 * A category or income payee whose biggest month stands far above its usual
 * one: a holiday, a dentist bill, a tax refund. Informational only: the
 * averages still include it, and the plan's seasonal months already expect a
 * past spike again in the same calendar month.
 */
export type IrregularItem =
  ({ kind: "spending"; group: string; category: string } & Peak) | ({ kind: "income"; payee: string } & Peak);

/**
 * Finds the irregular spending categories and income payees in a period.
 * Each one's monthly nets over `months` (zero where it has no rows) give a
 * peak and a median; it's irregular when the peak is more than
 * {@link IRREGULAR_PEAK_RATIO} × the median and at least
 * {@link IRREGULAR_MIN_GAP_CENTS} above it. A median below zero (refunds)
 * counts as zero, so a month of no refunds isn't a "peak".
 * @param months  The period's full months, oldest first.
 * @returns       The irregular items, largest peak first (the amount the UI shows), then
 *                by category or payee name, spending before income, then by group.
 * @example irregularItems(period) // [{ kind: "spending", group: "Holidays", category: "Travel", peak: 30000, peakMonth: "2026-07", median: 0 }]
 */
export function irregularItems(months: readonly MonthTotals[]): IrregularItem[] {
  const items: IrregularItem[] = [];
  for (const [group, category] of spendingKeys(months)) {
    const peak = irregularPeak(months, (m) => m.groups.get(group)?.get(category));
    if (peak !== undefined) {
      items.push({ kind: "spending", group, category, ...peak });
    }
  }
  for (const payee of new Set(months.flatMap((m) => [...m.incomeByPayee.keys()]))) {
    const peak = irregularPeak(months, (m) => m.incomeByPayee.get(payee));
    if (peak !== undefined) {
      items.push({ kind: "income", payee, ...peak });
    }
  }
  // Stryker disable next-line EqualityOperator: equivalent; no two items share a sort key
  return items.sort((a, b) => b.peak - a.peak || (sortKey(a) < sortKey(b) ? -1 : 1));
}

/** Every group and category pair with rows in any of the months, once each. */
function spendingKeys(months: readonly MonthTotals[]): [string, string][] {
  const keys = new Map<string, Set<string>>();
  for (const month of months) {
    for (const [group, categories] of month.groups) {
      const entry = keys.get(group) ?? new Set();
      for (const category of categories.keys()) {
        entry.add(category);
      }
      keys.set(group, entry);
    }
  }
  return [...keys].flatMap(([group, categories]) =>
    [...categories].map((category): [string, string] => [group, category]),
  );
}

/** The median the rule compares against: below zero counts as zero. */
const base = (item: Peak) => Math.max(item.median, 0);

/** How far the peak is above {@link base}. */
const gap = (item: Peak) => item.peak - base(item);

/**
 * Name, then spending before income, then group. `\u0000` sorts below every
 * other character, so a name that's a prefix of another still sorts first.
 */
const sortKey = (item: IrregularItem) =>
  item.kind === "spending" ? `${item.category}\u00000\u0000${item.group}` : `${item.payee}\u00001`;

/**
 * The peak and median of one category's or payee's monthly nets, when they
 * make it irregular.
 * @param months   The period's months, oldest first, at least one.
 * @param valueIn  The month's net for this category or payee, if it has rows.
 */
function irregularPeak(
  months: readonly MonthTotals[],
  valueIn: (m: MonthTotals) => Cents | undefined,
): Peak | undefined {
  const series = months.map((m) => ({ month: m.month, net: valueIn(m) ?? (0 as Cents) }));
  // Oldest first, so `>=` keeps the most recent of equal peaks.
  const top = series.reduce((best, next) => (next.net >= best.net ? next : best));
  const result = { peak: top.net, peakMonth: top.month, median: median(series.map((s) => s.net)) };
  return result.peak > IRREGULAR_PEAK_RATIO * base(result) && gap(result) >= IRREGULAR_MIN_GAP_CENTS
    ? result
    : undefined;
}

/** The median, rounded half away from zero when it falls between two cents. */
function median(values: Cents[]): Cents {
  const sorted = values.toSorted((a, b) => a - b);
  // The middle pair's indexes: equal for an odd count, adjacent for an even one.
  // `divRound` rounds (n − 1) / 2 up when it isn't whole, which gives the upper one.
  const upper = divRound(sorted.length - 1, 2);
  const lower = sorted.length - 1 - upper;
  return toCents(divRound((sorted[lower] ?? 0) + (sorted[upper] ?? 0), 2));
}
