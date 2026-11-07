import { describe, expect, it } from "vitest";
import { irregularItems } from "@/lib/budget/irregular";
import type { MonthTotals } from "@/lib/budget/months";
import type { Cents } from "@/lib/money/cents";

const c = (value: number) => value as Cents;

/**
 * A full month built from `spending` ("Group/Category" → cents) and `income`
 * (payee → cents). The totals aren't read by the rule, so they stay zero.
 */
function month(yearMonth: string, spending: Record<string, number> = {}, income: Record<string, number> = {}) {
  const groups = new Map<string, Map<string, Cents>>();
  for (const [key, net] of Object.entries(spending)) {
    const [group = "", category = ""] = key.split("/");
    const entry = groups.get(group) ?? new Map<string, Cents>();
    entry.set(category, c(net));
    groups.set(group, entry);
  }
  const totals: MonthTotals = {
    month: yearMonth,
    income: c(0),
    spending: c(0),
    groups,
    incomeByPayee: new Map(Object.entries(income).map(([payee, amount]) => [payee, c(amount)])),
    excluded: {
      transfer: { count: 0, total: c(0) },
      "opening-balance": { count: 0, total: c(0) },
      "card-payment": { count: 0, total: c(0) },
      uncategorised: { count: 0, total: c(0) },
    },
  };
  return totals;
}

/** Three months of one spending category, one value per month, Aug–Oct 2026. */
const spendingSeries = (aug: number, sep: number, oct: number) => [
  month("2026-08", { "Home/Repairs": aug }),
  month("2026-09", { "Home/Repairs": sep }),
  month("2026-10", { "Home/Repairs": oct }),
];

const repairs = (peak: number, peakMonth: string, median: number) => ({
  kind: "spending",
  group: "Home",
  category: "Repairs",
  peak,
  peakMonth,
  median,
});

describe("irregularItems", () => {
  it("flags a one-off spending month against the median of the period", () => {
    expect(irregularItems(spendingSeries(2000, 50000, 3000))).toEqual([repairs(50000, "2026-09", 3000)]);
  });

  it("counts a month without the category as zero", () => {
    const months = [month("2026-08"), month("2026-09", { "Home/Repairs": 20000 }), month("2026-10")];
    expect(irregularItems(months)).toEqual([repairs(20000, "2026-09", 0)]);
  });

  it("leaves out a steady category", () => {
    expect(irregularItems(spendingSeries(40000, 41000, 42000))).toEqual([]);
  });

  it("needs the peak to be more than three times the median", () => {
    // Median €60; €180 is exactly three times it, €180.01 more.
    expect(irregularItems(spendingSeries(6000, 18000, 6000))).toEqual([]);
    expect(irregularItems(spendingSeries(6000, 18001, 6000))).toEqual([repairs(18001, "2026-09", 6000)]);
  });

  it("needs the peak to be at least €100 above the median", () => {
    // Median €10: €109.99 is €99.99 above it, €110 is €100 above.
    expect(irregularItems(spendingSeries(1000, 10999, 1000))).toEqual([]);
    expect(irregularItems(spendingSeries(1000, 11000, 1000))).toEqual([repairs(11000, "2026-09", 1000)]);
  });

  it("takes the median of an even number of months as the rounded middle pair", () => {
    // Sorted: 1000, 1001, 2000, 40000; median (1001 + 2000) / 2 = 1500.5 → 1501
    const months = [
      month("2026-07", { "Home/Repairs": 2000 }),
      month("2026-08", { "Home/Repairs": 1000 }),
      month("2026-09", { "Home/Repairs": 40000 }),
      month("2026-10", { "Home/Repairs": 1001 }),
    ];
    expect(irregularItems(months)).toEqual([repairs(40000, "2026-09", 1501)]);
  });

  it("takes the median of an odd number of months as the middle value, whatever the order", () => {
    // Sorted: 0, 500, 900, 1200, 30000
    const months = [
      month("2026-06", { "Home/Repairs": 900 }),
      month("2026-07", { "Home/Repairs": 30000 }),
      month("2026-08", { "Home/Repairs": 0 }),
      month("2026-09", { "Home/Repairs": 1200 }),
      month("2026-10", { "Home/Repairs": 500 }),
    ];
    expect(irregularItems(months)).toEqual([repairs(30000, "2026-07", 900)]);
  });

  it("names the most recent month when the peak repeats", () => {
    // Two months of three make €300 the median: the usual, not a one-off.
    expect(irregularItems(spendingSeries(30000, 0, 30000))).toEqual([]);
    const months = [
      month("2026-06", { "Home/Repairs": 30000 }),
      month("2026-07"),
      month("2026-08"),
      month("2026-09", { "Home/Repairs": 30000 }),
      month("2026-10"),
    ];
    expect(irregularItems(months)).toEqual([repairs(30000, "2026-09", 0)]);
  });

  it("compares against zero when refunds take the median below it", () => {
    // Median −€150. Against it, a €0 month would be €150 "above"; against zero it's nothing.
    expect(irregularItems(spendingSeries(-15000, 0, -20000))).toEqual([]);
    // Against zero, €100 is a peak €100 above; the median shown is still the real one.
    expect(irregularItems(spendingSeries(-15000, 10000, -20000))).toEqual([repairs(10000, "2026-09", -15000)]);
    expect(irregularItems(spendingSeries(-15000, 9999, -20000))).toEqual([]);
  });

  it("flags irregular income per payee", () => {
    const months = [
      month("2026-08", {}, { Employer: 200000 }),
      month("2026-09", {}, { Employer: 200000, "Tax Office": 34000 }),
      month("2026-10", {}, { Employer: 205000 }),
    ];
    expect(irregularItems(months)).toEqual([
      { kind: "income", payee: "Tax Office", peak: 34000, peakMonth: "2026-09", median: 0 },
    ]);
  });

  it("keeps a category of the same name apart in different groups", () => {
    const months = [
      month("2026-08", { "Kids/Other": 20000, "Home/Other": 1000 }),
      month("2026-09", { "Home/Other": 1000 }),
      month("2026-10", { "Home/Other": 1000 }),
    ];
    expect(irregularItems(months)).toEqual([
      { kind: "spending", group: "Kids", category: "Other", peak: 20000, peakMonth: "2026-08", median: 0 },
    ]);
  });

  it("orders by the peak, the amount the list shows, not by how far it is above the median", () => {
    // Clothes: €137.16, €112.35 above its median. Travel: €133, €133 above.
    const months = [
      month("2026-08", { "Kids/Clothes": 2481, "Holidays/Travel": 13300 }),
      month("2026-09", { "Kids/Clothes": 13716 }),
      month("2026-10", { "Kids/Clothes": 2000 }),
    ];
    expect(
      irregularItems(months).map((item) => [item.kind === "income" ? item.payee : item.category, item.peak]),
    ).toEqual([
      ["Clothes", 13716],
      ["Travel", 13300],
    ]);
  });

  it("orders by the peak, largest first, then by name", () => {
    const months = [
      month("2026-08", { "Holidays/Travel": 30000, "Health/Dentist": 11700 }, { "Tax Office": 34000 }),
      month("2026-09", { "Holidays/Hotel": 52000, "Lifestyle/Gifts": 30000 }),
      month("2026-10", { "Lifestyle/Bikes": 30000 }, { Bonus: 30000 }),
    ];
    // Income and spending share one order: the payee "Bonus" sorts among the categories.
    expect(irregularItems(months).map((item) => (item.kind === "income" ? item.payee : item.category))).toEqual([
      "Hotel",
      "Tax Office",
      "Bikes",
      "Bonus",
      "Gifts",
      "Travel",
      "Dentist",
    ]);
  });

  it("orders equal names by group, and spending before income", () => {
    const months = [
      month("2026-08", { "Kids/Other": 20000, "Home/Other": 20000 }, { Other: 20000 }),
      month("2026-09"),
      month("2026-10"),
    ];
    expect(irregularItems(months).map((item) => (item.kind === "income" ? "income" : item.group))).toEqual([
      "Home",
      "Kids",
      "income",
    ]);
  });

  it("finds nothing in no months", () => {
    expect(irregularItems([])).toEqual([]);
  });
});
