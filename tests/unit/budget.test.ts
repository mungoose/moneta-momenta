import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { addMonths, buildMonths, monthOf, type MonthTotals } from "@/lib/budget/months";
import { defaultPeriodLength, periodOptions, summarise, type DataSummary } from "@/lib/budget/summary";
import { classify } from "@/lib/import/classify";
import { parseTransactions } from "@/lib/import/parse";
import type { ParsedFile } from "@/lib/import/types";
import type { Cents } from "@/lib/money/cents";

const fixture = (name: string) => readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8");
const sample = (name: string) => readFileSync(new URL(`../../public/samples/${name}.tsv`, import.meta.url), "utf8");

/** Builds a minimal tab-separated file: the six required columns, then `rows`. */
const tsv = (...rows: string[][]) =>
  [["Date", "Payee", "Category Group", "Category", "Outflow", "Inflow"], ...rows].map((r) => r.join("\t")).join("\r\n");

function parsed(text: string): ParsedFile {
  const result = parseTransactions(text);
  if (!result.ok) throw new Error(`expected rows, got ${JSON.stringify(result.error)}`);
  return result;
}

const months = (text: string, reference = "2026-11") => buildMonths(parsed(text).rows.map(classify), reference);

function summary(text: string, reference = "2026-11", periodLength?: number): DataSummary {
  const result = summarise(parsed(text), reference, periodLength);
  if (!result.ok) throw new Error(`expected a summary, got ${JSON.stringify(result.error)}`);
  return result.summary;
}

function budgetError(text: string, reference = "2026-11") {
  const result = summarise(parsed(text), reference);
  if (result.ok) throw new Error("expected a budget error");
  return result.error;
}

const salary = (date: string, amount = "2000,00") => [date, "Employer", "Inflow", "Ready to Assign", "0,00", amount];
const spend = (date: string, amount: string, group = "Food & Drink", category = "Groceries") => [
  date,
  "Shop",
  group,
  category,
  amount,
  "0,00",
];

/** Three full months (Aug–Oct 2026) of one salary and one grocery row each, plus `extra` rows. */
const threeMonths = (...extra: string[][]) =>
  tsv(
    ...extra,
    salary("25/10/2026"),
    spend("01/10/2026", "100,00"),
    salary("25/09/2026"),
    spend("01/09/2026", "100,00"),
    salary("25/08/2026"),
    spend("01/08/2026", "100,00"),
  );

const NO_EXCLUDED = {
  transfer: { count: 0, total: 0 },
  "opening-balance": { count: 0, total: 0 },
  "card-payment": { count: 0, total: 0 },
  uncategorised: { count: 0, total: 0 },
};

describe("monthOf / addMonths", () => {
  it("takes the month of an ISO date", () => {
    expect(monthOf("2026-07-31")).toBe("2026-07");
  });

  it.each([
    ["2026-11", 1, "2026-12"],
    ["2026-12", 1, "2027-01"],
    ["2026-01", -1, "2025-12"],
    ["2026-11", 0, "2026-11"],
    ["2026-11", -11, "2025-12"],
    ["2026-11", -12, "2025-11"],
    ["2026-11", 26, "2029-01"],
    ["0999-12", 1, "1000-01"],
    ["1000-01", -1, "0999-12"],
  ])("%s + %i months = %s", (month, count, expected) => {
    expect(addMonths(month, count)).toBe(expected);
  });
});

describe("buildMonths", () => {
  it("totals income and spending per month, oldest first", () => {
    const { fullMonths } = months(fixture("three-months.tsv"));
    expect(fullMonths.map(({ month, income, spending }) => ({ month, income, spending }))).toEqual([
      { month: "2026-08", income: 200000, spending: 10000 },
      { month: "2026-09", income: 200000, spending: 20000 },
      { month: "2026-10", income: 210000, spending: 75000 },
    ]);
  });

  it("keeps a month with no rows inside the range as a real zero", () => {
    const { fullMonths, droppedMonths } = months(fixture("no-income-month.tsv"));
    expect(fullMonths.map((m) => m.month)).toEqual(["2026-07", "2026-08", "2026-09", "2026-10"]);
    const september = fullMonths[2] as MonthTotals;
    expect([september.income, september.spending, september.groups.size]).toEqual([0, 0, 0]);
    expect(september.excluded).toEqual(NO_EXCLUDED);
    expect(droppedMonths).toEqual([]);
  });

  it("drops the unfinished reference month", () => {
    const { fullMonths, droppedMonths } = months(fixture("partial-current.tsv"));
    expect(fullMonths.map((m) => m.month)).toEqual(["2026-08", "2026-09", "2026-10"]);
    expect(droppedMonths).toEqual([{ month: "2026-11", why: "current" }]);
  });

  it("drops every month after the reference month that has rows, and no empty ones", () => {
    const { fullMonths, droppedMonths } = months(threeMonths(spend("03/01/2027", "1,00"), spend("02/11/2026", "1,00")));
    expect(fullMonths.map((m) => m.month)).toEqual(["2026-08", "2026-09", "2026-10"]);
    expect(droppedMonths).toEqual([
      { month: "2026-11", why: "current" },
      { month: "2027-01", why: "current" },
    ]);
  });

  it("ends the range at the last month with rows when the data stops before the reference month", () => {
    const { fullMonths } = months(fixture("three-months.tsv"), "2027-03");
    expect(fullMonths.map((m) => m.month)).toEqual(["2026-08", "2026-09", "2026-10"]);
  });

  it("drops a first month that starts after day 7, saying when the file starts", () => {
    const { fullMonths, droppedMonths } = months(fixture("starts-mid-month.tsv"));
    expect(fullMonths.map((m) => m.month)).toEqual(["2026-08", "2026-09", "2026-10"]);
    expect(droppedMonths).toEqual([{ month: "2026-07", why: "starts-mid-month", firstDate: "2026-07-18" }]);
  });

  it("keeps a first month that starts on day 7, and drops one that starts on day 8", () => {
    expect(months(threeMonths(spend("07/07/2026", "1,00"))).fullMonths[0]?.month).toBe("2026-07");
    expect(months(threeMonths(spend("08/07/2026", "1,00"))).droppedMonths).toEqual([
      { month: "2026-07", why: "starts-mid-month", firstDate: "2026-07-08" },
    ]);
  });

  it("judges the first month by its earliest row, wherever that row is in the file", () => {
    const text = threeMonths(spend("20/07/2026", "1,00"), spend("02/07/2026", "1,00"), spend("15/07/2026", "1,00"));
    expect(months(text).fullMonths[0]?.month).toBe("2026-07");
  });

  it("counts excluded rows as transactions when finding where the file starts", () => {
    const transfer = ["01/07/2026", "Transfer : Savings", "", "", "10,00", "0,00"];
    expect(months(threeMonths(spend("20/07/2026", "1,00"), transfer)).fullMonths[0]?.month).toBe("2026-07");
  });

  it("only checks the start day of the first month, not of later ones", () => {
    // October's first row is on the 25th; it's still a full month.
    const text = tsv(salary("25/10/2026"), salary("25/09/2026"), salary("01/08/2026"));
    expect(months(text).fullMonths.map((m) => m.month)).toEqual(["2026-08", "2026-09", "2026-10"]);
  });

  it("reports a first month at or after the reference month as current, not as starting mid-month", () => {
    const { fullMonths, droppedMonths } = months(tsv(spend("20/11/2026", "1,00")));
    expect(fullMonths).toEqual([]);
    expect(droppedMonths).toEqual([{ month: "2026-11", why: "current" }]);
  });

  it("gives no months for no rows", () => {
    expect(buildMonths([], "2026-11")).toEqual({ fullMonths: [], droppedMonths: [] });
  });

  it("totals spending per group and category; a refund can take a category below zero", () => {
    const text = threeMonths(
      spend("05/10/2026", "80,00", "Lifestyle", "Clothes"),
      ["09/10/2026", "Shop", "Lifestyle", "Clothes", "0,00", "100,00"],
      spend("10/10/2026", "15,00", "Lifestyle", "Hobbies"),
      spend("12/10/2026", "5,00", "Food & Drink", "Groceries"),
    );
    const october = months(text).fullMonths[2] as MonthTotals;
    expect(october.spending).toBe(10000 + 8000 - 10000 + 1500 + 500);
    expect(october.groups).toEqual(
      new Map([
        [
          "Lifestyle",
          new Map([
            ["Clothes", -2000],
            ["Hobbies", 1500],
          ]),
        ],
        ["Food & Drink", new Map([["Groceries", 10500]])],
      ]),
    );
  });

  it("keeps a category of the same name apart in different groups", () => {
    const text = threeMonths(
      spend("05/10/2026", "1,00", "Kids", "Other"),
      spend("06/10/2026", "2,00", "Home", "Other"),
    );
    const october = months(text).fullMonths[2] as MonthTotals;
    expect(october.groups.get("Kids")).toEqual(new Map([["Other", 100]]));
    expect(october.groups.get("Home")).toEqual(new Map([["Other", 200]]));
  });

  it("handles group and category names that are special in plain objects", () => {
    const text = threeMonths(spend("05/10/2026", "1,00", "__proto__", "constructor"));
    const october = months(text).fullMonths[2] as MonthTotals;
    expect(october.groups.get("__proto__")).toEqual(new Map([["constructor", 100]]));
  });

  it("nets income rows: an outflow in the income group lowers income", () => {
    const text = threeMonths(["26/10/2026", "Employer", "Inflow", "Ready to Assign", "50,00", "0,00"]);
    expect(months(text).fullMonths[2]?.income).toBe(200000 - 5000);
  });

  it("counts and totals excluded rows per reason and month, by the money each row moved", () => {
    const text = threeMonths(
      ["05/10/2026", "Transfer : SEB Credit", "", "", "300,00", "0,00"],
      ["05/10/2026", "Transfer : SEB", "", "", "0,00", "300,00"],
      ["06/10/2026", "Starting Balance", "Inflow", "Ready to Assign", "0,00", "1000,00"],
      ["07/10/2026", "SEB", "Credit Card Payments", "SEB Credit", "250,00", "0,00"],
      ["08/10/2026", "Bank", "", "", "1,50", "0,00"],
      ["09/09/2026", "Transfer : Savings", "", "", "20,00", "0,00"],
    );
    const { fullMonths } = months(text);
    expect(fullMonths[2]?.excluded).toEqual({
      transfer: { count: 2, total: 60000 },
      "opening-balance": { count: 1, total: 100000 },
      "card-payment": { count: 1, total: 25000 },
      uncategorised: { count: 1, total: 150 },
    });
    expect(fullMonths[1]?.excluded).toEqual({ ...NO_EXCLUDED, transfer: { count: 1, total: 2000 } });
    // Excluded rows don't touch income or spending.
    expect([fullMonths[2]?.income, fullMonths[2]?.spending]).toEqual([200000, 10000]);
  });

  it("refuses totals beyond the safe-integer range instead of losing cents", () => {
    const huge = "45035996273704,96"; // 2^52 cents; two of them pass 2^53
    expect(() => months(threeMonths(spend("05/10/2026", huge), spend("06/10/2026", huge)))).toThrow(RangeError);
  });
});

describe("periodOptions / defaultPeriodLength", () => {
  it.each([
    [3, [3], 3],
    [4, [3], 4],
    [5, [3], 5],
    [6, [3, 6], 6],
    [11, [3, 6], 6],
    [12, [3, 6, 12], 6],
    [30, [3, 6, 12], 6],
  ])("%i full months → options %j, default %i", (count, options, fallback) => {
    expect(periodOptions(count)).toEqual(options);
    expect(defaultPeriodLength(count)).toBe(fallback);
  });
});

describe("summarise", () => {
  it("works with exactly three full months, all of them in the period", () => {
    const s = summary(fixture("three-months.tsv"));
    expect(s.period).toEqual(["2026-08", "2026-09", "2026-10"]);
    // (2000 + 2000 + 2100) / 3 = 2033.333…; (100 + 200 + 750) / 3 = 350
    expect([s.avgIncome, s.avgSpending, s.margin]).toEqual([203333, 35000, 168333]);
    expect(s.fullMonths.map((m) => m.month)).toEqual(s.period);
    expect(s.decimal).toBe(",");
  });

  it("refuses two full months, saying how many it found and what it dropped", () => {
    expect(budgetError(fixture("two-months.tsv"))).toEqual({
      code: "too-little-data",
      fullMonths: 2,
      droppedMonths: [],
    });
    expect(budgetError(threeMonths(), "2026-10")).toEqual({
      code: "too-little-data",
      fullMonths: 2,
      droppedMonths: [{ month: "2026-10", why: "current" }],
    });
  });

  it("leaves the unfinished month out of the averages", () => {
    const s = summary(fixture("partial-current.tsv"));
    expect([s.avgIncome, s.avgSpending]).toEqual([200000, 10000]);
    expect(s.droppedMonths).toEqual([{ month: "2026-11", why: "current" }]);
  });

  it("averages a month without income as a zero and lists it", () => {
    const s = summary(fixture("no-income-month.tsv"));
    expect(s.period).toEqual(["2026-07", "2026-08", "2026-09", "2026-10"]);
    expect([s.avgIncome, s.avgSpending]).toEqual([150000, 7500]);
    expect(s.noIncomeMonths).toEqual(["2026-09"]);
  });

  it("lists only the period's months without income", () => {
    expect(summary(fixture("no-income-month.tsv"), "2026-11", 3).noIncomeMonths).toEqual(["2026-09"]);
    const text = tsv(spend("01/07/2026", "1,00"), salary("25/08/2026"), salary("25/09/2026"), salary("25/10/2026"));
    expect(summary(text, "2026-11", 3).noIncomeMonths).toEqual([]);
    expect(summary(text, "2026-11", 4).noIncomeMonths).toEqual(["2026-07"]);
  });

  it("takes the period from the most recent full months", () => {
    const s = summary(fixture("no-income-month.tsv"), "2026-11", 3);
    expect(s.period).toEqual(["2026-08", "2026-09", "2026-10"]);
    expect([s.avgIncome, s.avgSpending]).toEqual([divide(400000, 3), divide(20000, 3)]);
    // All full months stay available, e.g. for the seasonal lookup.
    expect(s.fullMonths).toHaveLength(4);
  });

  it.each([2, 5, 3.5, Number.NaN])("throws for a period of %s months when three exist", (length) => {
    expect(() => summarise(parsed(fixture("three-months.tsv")), "2026-11", length)).toThrow(RangeError);
  });

  it("refuses a period without income", () => {
    const text = tsv(spend("01/10/2026", "1,00"), spend("01/09/2026", "1,00"), spend("01/08/2026", "1,00"));
    expect(budgetError(text)).toEqual({ code: "no-income" });
  });

  it("refuses a period whose income nets to below zero", () => {
    const text = threeMonths(["26/10/2026", "Employer", "Inflow", "Ready to Assign", "6000,01", "0,00"]);
    expect(budgetError(text)).toEqual({ code: "no-income" });
  });

  it("checks income in the chosen period only", () => {
    const text = tsv(
      ["01/07/2026", "Transfer : Savings", "", "", "1,00", "0,00"], // so July starts on day 1
      salary("25/07/2026"),
      spend("01/08/2026", "1,00"),
      spend("01/09/2026", "1,00"),
      spend("01/10/2026", "1,00"),
    );
    expect(summarise(parsed(text), "2026-11", 3)).toEqual({ ok: false, error: { code: "no-income" } });
    expect(summarise(parsed(text), "2026-11", 4).ok).toBe(true);
  });

  it("returns a summary when spending exceeds income; the margin is negative", () => {
    const s = summary(threeMonths(spend("05/10/2026", "6000,00")));
    expect(s.margin).toBe(divide(600000, 3) - divide(630000, 3));
    expect(s.margin).toBeLessThan(0);
  });

  it("averages each group and category over the period, largest first, ties by name", () => {
    const text = threeMonths(
      spend("05/10/2026", "30,00", "Lifestyle", "Clothes"),
      spend("05/09/2026", "0,01", "Lifestyle", "Hobbies"),
      spend("06/10/2026", "300,00", "Home", "Rent"),
      spend("07/10/2026", "300,00", "Car", "Fuel"),
    );
    expect(summary(text).byGroup).toEqual([
      { group: "Car", avg: 10000, categories: [{ category: "Fuel", avg: 10000 }] },
      { group: "Food & Drink", avg: 10000, categories: [{ category: "Groceries", avg: 10000 }] },
      { group: "Home", avg: 10000, categories: [{ category: "Rent", avg: 10000 }] },
      // 30,00 + 0,01 over 3 months: 1000.33 → 1000; the categories round on their own
      {
        group: "Lifestyle",
        avg: 1000,
        categories: [
          { category: "Clothes", avg: 1000 },
          { category: "Hobbies", avg: 0 },
        ],
      },
    ]);
  });

  it("orders categories with the same average by name, whatever the row order", () => {
    const text = threeMonths(spend("05/10/2026", "3,00", "Kids", "Toys"), spend("06/10/2026", "3,00", "Kids", "Books"));
    const kids = summary(text).byGroup.find((g) => g.group === "Kids");
    expect(kids?.categories.map((c) => c.category)).toEqual(["Books", "Toys"]);
  });

  it("puts a group that went below zero after one that didn't", () => {
    const text = threeMonths(["05/10/2026", "Shop", "Lifestyle", "Clothes", "0,00", "30,00"]);
    expect(summary(text).byGroup.map((g) => [g.group, g.avg])).toEqual([
      ["Food & Drink", 10000],
      ["Lifestyle", -1000],
    ]);
  });

  it("leaves out groups that only have rows outside the period", () => {
    const text = tsv(
      spend("01/07/2026", "1,00", "Old", "Thing"),
      salary("25/08/2026"),
      salary("25/09/2026"),
      salary("25/10/2026"),
    );
    expect(summary(text, "2026-11", 3).byGroup).toEqual([]);
    expect(summary(text, "2026-11", 4).byGroup).toEqual([
      { group: "Old", avg: 25, categories: [{ category: "Thing", avg: 25 }] },
    ]);
  });

  it("totals the excluded rows of the period only", () => {
    const text = tsv(
      ["01/07/2026", "Transfer : Savings", "", "", "10,00", "0,00"],
      salary("25/07/2026"),
      ["01/08/2026", "Transfer : Savings", "", "", "20,00", "0,00"],
      salary("25/08/2026"),
      ["01/09/2026", "Transfer : Savings", "", "", "0,00", "40,00"],
      salary("25/09/2026"),
      salary("25/10/2026"),
    );
    expect(summary(text, "2026-11", 3).excluded).toEqual({ ...NO_EXCLUDED, transfer: { count: 2, total: 6000 } });
    expect(summary(text, "2026-11", 4).excluded).toEqual({ ...NO_EXCLUDED, transfer: { count: 3, total: 7000 } });
  });
});

/** Expected averages are written as the division they come from; rounding half away from zero. */
function divide(total: number, count: number): number {
  return Math.sign(total) * Math.round(Math.abs(total) / count);
}

/**
 * Golden values, computed independently with awk from the sample TSVs (not
 * with the code under test): per-month income and spending, as cents.
 */
const COMFORTABLE: [string, number, number][] = [
  ["2025-11", 253494, 186552],
  ["2025-12", 323184, 208867],
  ["2026-01", 253055, 187943],
  ["2026-02", 253888, 174222],
  ["2026-03", 254157, 206877],
  ["2026-04", 288894, 191036],
  ["2026-05", 253381, 186598],
  ["2026-06", 254575, 210270],
  ["2026-07", 252965, 244362],
  ["2026-08", 253252, 185985],
  ["2026-09", 253515, 179055],
  ["2026-10", 254587, 207642],
];

const TIGHT: [string, number, number][] = [
  ["2025-11", 218175, 201084],
  ["2025-12", 217685, 234132],
  ["2026-01", 217387, 201649],
  ["2026-02", 218562, 185164],
  ["2026-03", 218474, 195275],
  ["2026-04", 234976, 189188],
  ["2026-05", 217875, 205292],
  ["2026-06", 217119, 238555],
  ["2026-07", 217926, 241334],
  ["2026-08", 217525, 176242],
  ["2026-09", 217517, 232916],
  ["2026-10", 216428, 207084],
];

const totals = (s: DataSummary) => s.fullMonths.map((m): [string, Cents, Cents] => [m.month, m.income, m.spending]);

describe("golden: sample files", () => {
  it.each([
    ["en_comfortable", COMFORTABLE],
    ["et_comfortable", COMFORTABLE],
    ["en_tight", TIGHT],
    ["et_tight", TIGHT],
  ] as const)("%s reproduces the monthly totals, nothing dropped", (name, expected) => {
    const s = summary(sample(name));
    expect(totals(s)).toEqual(expected);
    expect(s.droppedMonths).toEqual([]);
  });

  it("comfortable, last 6 months (May–Oct 2026): €2,537.13 − €2,023.19 = €513.94", () => {
    const s = summary(sample("en_comfortable"));
    expect(s.period).toEqual(["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"]);
    expect([s.avgIncome, s.avgSpending, s.margin]).toEqual([253713, 202319, 51394]);
    expect(s.noIncomeMonths).toEqual([]);
    expect(s.decimal).toBe(".");
  });

  it("comfortable: July 2026 spending is €2,443.62", () => {
    expect(summary(sample("en_comfortable")).fullMonths.find((m) => m.month === "2026-07")?.spending).toBe(244362);
  });

  it("comfortable: group averages over May–Oct 2026", () => {
    // awk group totals over the six months, divided by 6 (Car and Lifestyle land exactly on .5)
    expect(summary(sample("en_comfortable")).byGroup.map((g) => [g.group, g.avg])).toEqual([
      ["Home", 64448], // 386686
      ["Food & Drink", 56526], // 339157
      ["Kids", 30830], // 184982
      ["Car", 21957], // 131739
      ["Holidays", 13667], // 82000
      ["Communication", 6222], // 37332
      ["Lifestyle", 5775], // 34647
      ["Health", 2895], // 17369
    ]);
  });

  it("comfortable: transfers in the period", () => {
    expect(summary(sample("en_comfortable")).excluded).toEqual({
      ...NO_EXCLUDED,
      transfer: { count: 12, total: 283666 },
    });
  });

  it.each([
    [3, 253785, 190894], // 761354 / 3, 572682 / 3
    [12, 262412, 197451], // 3148947 / 12, 2369409 / 12
  ])("comfortable, last %i months", (length, avgIncome, avgSpending) => {
    const s = summary(sample("en_comfortable"), "2026-11", length);
    expect(s.period).toHaveLength(length);
    expect([s.avgIncome, s.avgSpending, s.margin]).toEqual([avgIncome, avgSpending, avgIncome - avgSpending]);
  });

  it("tight, last 6 months: margin ≈ €5; July 2026 margin −€234.08", () => {
    const s = summary(sample("en_tight"));
    expect([s.avgIncome, s.avgSpending, s.margin]).toEqual([217398, 216904, 494]);
    const july = s.fullMonths.find((m) => m.month === "2026-07") as MonthTotals;
    expect(july.income - july.spending).toBe(-23408);
  });
});
