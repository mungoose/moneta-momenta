import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { addMonths, type MonthTotals } from "@/lib/budget/months";
import { summarise, type DataSummary } from "@/lib/budget/summary";
import {
  MAX_ANNUAL_RATE_BPS,
  MAX_INSTALMENTS,
  MAX_MONTHLY_FEE_CENTS,
  MAX_PRICE_CENTS,
  MIN_INSTALMENTS,
} from "@/lib/constants";
import { parseTransactions } from "@/lib/import/parse";
import { sum, type Cents } from "@/lib/money/cents";
import { assessPlan, bufferFor, statusOf, type PlanMonth } from "@/lib/plan/affordability";
import { annuityInterest, buildSchedule, type PlanInput, type Schedule } from "@/lib/plan/schedule";

const c = (value: number) => value as Cents;

const input = (overrides: Partial<PlanInput> = {}): PlanInput => ({
  price: c(120000),
  upfront: c(0),
  count: 12,
  annualRateBps: 0,
  monthlyFee: c(0),
  ...overrides,
});

function schedule(overrides: Partial<PlanInput> = {}): Schedule {
  const result = buildSchedule(input(overrides));
  if (!result.ok) {
    throw new Error(`expected a schedule, got ${JSON.stringify(result.errors)}`);
  }
  return result.schedule;
}

function errors(overrides: Partial<PlanInput>) {
  const result = buildSchedule(input(overrides));
  if (result.ok) {
    throw new Error("expected input errors");
  }
  return result.errors;
}

describe("buildSchedule: validation", () => {
  it.each([
    ["price", { price: c(0) }, "too-low"],
    ["price", { price: c(-100) }, "too-low"],
    ["price", { price: c(MAX_PRICE_CENTS + 1) }, "too-high"],
    ["price", { price: c(100.5) }, "not-whole"],
    ["upfront", { upfront: c(-1) }, "too-low"],
    ["upfront", { upfront: c(120000) }, "too-high"],
    ["upfront", { upfront: c(120001) }, "too-high"],
    ["upfront", { upfront: c(0.5) }, "not-whole"],
    ["count", { count: MIN_INSTALMENTS - 1 }, "too-low"],
    ["count", { count: MAX_INSTALMENTS + 1 }, "too-high"],
    ["count", { count: 2.5 }, "not-whole"],
    ["count", { count: Number.NaN }, "not-whole"],
    ["annualRateBps", { annualRateBps: -1 }, "too-low"],
    ["annualRateBps", { annualRateBps: MAX_ANNUAL_RATE_BPS + 1 }, "too-high"],
    ["annualRateBps", { annualRateBps: 9.9 }, "not-whole"],
    ["monthlyFee", { monthlyFee: c(-1) }, "too-low"],
    ["monthlyFee", { monthlyFee: c(MAX_MONTHLY_FEE_CENTS + 1) }, "too-high"],
    ["monthlyFee", { monthlyFee: c(Number.POSITIVE_INFINITY) }, "not-whole"],
  ] as const)("rejects %s %j as %s", (field, overrides, code) => {
    expect(errors(overrides)).toEqual([{ field, code }]);
  });

  it.each([
    { price: c(1) },
    { price: c(MAX_PRICE_CENTS) },
    { upfront: c(119999) },
    { count: MIN_INSTALMENTS },
    { count: MAX_INSTALMENTS },
    { annualRateBps: MAX_ANNUAL_RATE_BPS },
    { monthlyFee: c(MAX_MONTHLY_FEE_CENTS) },
  ])("accepts the boundary %j", (overrides) => {
    expect(buildSchedule(input(overrides)).ok).toBe(true);
  });

  it("allows 2 to 60 instalments and a price up to €1,000,000", () => {
    expect([MIN_INSTALMENTS, MAX_INSTALMENTS, MAX_PRICE_CENTS]).toEqual([2, 60, 100_000_000]);
  });

  it("reports every bad field, in form order", () => {
    expect(
      errors({ price: c(0), upfront: c(-1), count: 1, annualRateBps: -1, monthlyFee: c(-1) }).map((e) => e.field),
    ).toEqual(["price", "upfront", "count", "annualRateBps", "monthlyFee"]);
  });
});

describe("buildSchedule: amounts", () => {
  it("interest-free €1,200 over 12: twelve €100 instalments", () => {
    expect(schedule()).toEqual({
      financed: 120000,
      interest: 0,
      fees: 0,
      total: 120000,
      instalments: Array<number>(12).fill(10000),
    });
  });

  it("the upfront payment isn't spread", () => {
    expect(schedule({ price: c(189000), upfront: c(29000) }).financed).toBe(160000);
  });

  it("puts the remainder on the last instalment: €1,000 over 12", () => {
    expect(schedule({ price: c(100000) }).instalments).toEqual([...Array<number>(11).fill(8333), 8337]);
  });

  it("a monthly fee adds fee × count", () => {
    const s = schedule({ monthlyFee: c(250) });
    expect([s.fees, s.total]).toEqual([3000, 123000]);
    expect(s.instalments).toEqual(Array<number>(12).fill(10250));
  });

  // Independent values: Python's decimal module at 50 digits, then the
  // repayment rounded half up to cents.
  it("€1,600 at 9.9% over 12 with a €2.50 fee: €140.59 + €2.50 a month", () => {
    expect(schedule({ price: c(189000), upfront: c(29000), annualRateBps: 990, monthlyFee: c(250) })).toEqual({
      financed: 160000,
      interest: 8708,
      fees: 3000,
      total: 171708,
      instalments: Array<number>(12).fill(14309),
    });
  });

  it.each([
    [1_000_000, 1200, 12, 66188], // €10,000 at 12%: €888.49 a month
    [2_000_000, 500, 60, 264520], // €20,000 at 5% over 5 years: €377.42 a month
    [100_000_000, 10_000, 60, 404138300], // the largest plan: €84,023.05 a month
    [100, 1, 60, 20], // tiny amounts: €0.0167 a month rounds up to €0.02
  ])("annuity: %i cents at %i bps over %i months costs %i cents", (financed, bps, count, interest) => {
    expect(annuityInterest(c(financed), bps, count)).toBe(interest);
  });

  it("annuity: a 0% rate costs nothing", () => {
    expect(annuityInterest(c(120000), 0, 12)).toBe(0);
  });

  it("annuity: interest never goes negative when rounding the repayment down", () => {
    // €10 at 0.01% over 3: the repayment €3.3339 rounds to €3.33, and 3 × €3.33 < €10
    expect(annuityInterest(c(1000), 1, 3)).toBe(0);
    expect(schedule({ price: c(1000), count: 3, annualRateBps: 1 }).instalments).toEqual([333, 333, 334]);
  });

  it("instalments always add up exactly to the total (property, 2,000 random plans)", () => {
    // A fixed-seed Park–Miller generator, so a failure reproduces. Every
    // product stays below 2^47, so the arithmetic is exact.
    let seed = 20261107;
    const random = (max: number) => {
      seed = (seed * 48271) % 2147483647;
      return seed % (max + 1);
    };
    for (let i = 0; i < 2000; i++) {
      const price = 1 + random(MAX_PRICE_CENTS - 1);
      const plan = input({
        price: c(price),
        upfront: c(random(price - 1)),
        count: MIN_INSTALMENTS + random(MAX_INSTALMENTS - MIN_INSTALMENTS),
        annualRateBps: random(3) === 0 ? 0 : random(MAX_ANNUAL_RATE_BPS),
        monthlyFee: c(random(1) === 0 ? 0 : random(MAX_MONTHLY_FEE_CENTS)),
      });
      const result = buildSchedule(plan);
      if (!result.ok) {
        throw new Error(`unexpected errors for ${JSON.stringify(plan)}`);
      }
      const s = result.schedule;
      const [first = 0] = s.instalments;
      const last = s.instalments.at(-1) ?? 0;
      expect(s.instalments).toHaveLength(plan.count);
      expect(sum(s.instalments)).toBe(s.total);
      expect(s.total).toBe(plan.price - plan.upfront + s.interest + s.fees);
      expect(s.fees).toBe(plan.monthlyFee * plan.count);
      expect(s.interest).toBeGreaterThanOrEqual(0);
      expect(s.instalments.slice(0, -1).every((amount) => amount === first)).toBe(true);
      expect(last - first).toBeGreaterThanOrEqual(0);
      expect(last - first).toBeLessThan(plan.count);
    }
  });
});

describe("bufferFor / statusOf", () => {
  it.each([
    [253713, 25371], // 10% of €2,537.13
    [5, 1], // 0.5 cent rounds up
    [4, 0],
    [0, 0],
  ])("buffer for average income %i is %i", (avgIncome, buffer) => {
    expect(bufferFor(c(avgIncome))).toBe(buffer);
  });

  it.each([
    [25372, "fits"],
    [25371, "fits"], // exactly the buffer
    [25370, "tight"], // buffer − 1
    [1, "tight"],
    [0, "tight"],
    [-1, "no-fit"],
  ] as const)("leftover %i with a 25371 buffer: %s", (leftover, status) => {
    expect(statusOf(c(leftover), c(25371))).toBe(status);
  });
});

/** A full month with only an income and a spending total; the plan reads nothing else. */
const month = (yearMonth: string, spending: number, income = 300000): MonthTotals => ({
  month: yearMonth,
  income: c(income),
  spending: c(spending),
  groups: new Map(),
  excluded: {
    transfer: { count: 0, total: c(0) },
    "opening-balance": { count: 0, total: c(0) },
    "card-payment": { count: 0, total: c(0) },
    uncategorised: { count: 0, total: c(0) },
  },
});

/** Average income €3,000, average spending €2,000, and the given full months. */
const budget = (...fullMonths: MonthTotals[]) => ({
  avgIncome: c(300000),
  avgSpending: c(200000),
  fullMonths,
});

const instalments = (count: number, amount = 10000) => Array<Cents>(count).fill(c(amount));

describe("assessPlan", () => {
  it("first instalment is due the month after the reference month, across a year end", () => {
    const result = assessPlan(budget(), instalments(3), "2026-11");
    expect(result.months.map((m) => m.month)).toEqual(["2026-12", "2027-01", "2027-02"]);
    expect(assessPlan(budget(), instalments(2), "2026-12").months.map((m) => m.month)).toEqual(["2027-01", "2027-02"]);
  });

  it("without seasonal data: margin = income − average spending, leftover = margin − instalment", () => {
    const result = assessPlan(budget(), [c(10000), c(10007)], "2026-11");
    expect(result.buffer).toBe(30000);
    expect(result.months).toEqual<PlanMonth[]>([
      {
        month: "2026-12",
        instalment: c(10000),
        expectedSpending: c(200000),
        spendingSource: "average",
        margin: c(100000),
        leftover: c(90000),
        status: "fits",
      },
      {
        month: "2027-01",
        instalment: c(10007),
        expectedSpending: c(200000),
        spendingSource: "average",
        margin: c(100000),
        leftover: c(89993),
        status: "fits",
      },
    ]);
    expect(result.verdict).toBe("fits");
  });

  it("a month that cost more than the average uses its actual spending", () => {
    const [july] = assessPlan(budget(month("2026-07", 260000)), instalments(8), "2026-11").months.filter((m) =>
      m.month.endsWith("-07"),
    );
    expect(july).toEqual({
      month: "2027-07",
      instalment: 10000,
      expectedSpending: 260000,
      spendingSource: "seasonal",
      seasonalMonth: "2026-07",
      margin: 40000,
      leftover: 30000,
      status: "fits",
    });
  });

  it.each([
    ["the same as", 200000],
    ["less than", 150000],
  ])("a month that cost %s the average uses the average", (_, spending) => {
    const [dec] = assessPlan(budget(month("2025-12", spending)), instalments(1), "2026-11").months;
    expect(dec).toMatchObject({ month: "2026-12", expectedSpending: 200000, spendingSource: "average" });
    expect(dec).not.toHaveProperty("seasonalMonth");
  });

  it("uses the most recent occurrence of each calendar month, even outside the averaging period", () => {
    // 13 full months, Oct 2025 to Oct 2026: October appears twice, and the
    // cheap Oct 2026 wins over the expensive Oct 2025.
    const full = Array.from({ length: 13 }, (_, i) => month(addMonths("2025-10", i), 100000));
    full[0] = month("2025-10", 290000);
    full[1] = month("2025-11", 250000);
    const result = assessPlan(budget(...full), instalments(12), "2026-11");
    const byMonth = new Map(result.months.map((m) => [m.month, m]));
    expect(byMonth.get("2027-10")).toMatchObject({ expectedSpending: 200000, spendingSource: "average" });
    expect(byMonth.get("2027-11")).toMatchObject({
      expectedSpending: 250000,
      spendingSource: "seasonal",
      seasonalMonth: "2025-11",
    });
  });

  it("a plan longer than a year reuses each calendar month's data", () => {
    const result = assessPlan(budget(month("2026-07", 260000)), instalments(24), "2026-11");
    expect(result.months.filter((m) => m.spendingSource === "seasonal").map((m) => m.month)).toEqual([
      "2027-07",
      "2028-07",
    ]);
  });

  it("status per month, and the verdict is the worst month", () => {
    // buffer 30000; margins: Dec 100000, Jan 39999, Feb 30000, Mar 9999
    const data = budget(month("2026-01", 260001), month("2026-02", 270000), month("2026-03", 290001));
    const result = assessPlan(data, instalments(4, 10000), "2026-11");
    expect(result.months.map((m) => [m.leftover, m.status])).toEqual([
      [90000, "fits"],
      [29999, "tight"],
      [20000, "tight"],
      [-1, "no-fit"],
    ]);
    expect(result.verdict).toBe("no-fit");
    expect(assessPlan(data, instalments(3, 10000), "2026-11").verdict).toBe("tight");
    expect(assessPlan(data, instalments(1, 10000), "2026-11").verdict).toBe("fits");
  });

  it("no-fit outranks tight whatever the order", () => {
    // Dec no-fit, Jan tight
    const data = budget(month("2025-12", 300001), month("2026-01", 280000));
    expect(assessPlan(data, instalments(2, 0), "2026-11").verdict).toBe("no-fit");
  });
});

const sample = (name: string) => readFileSync(new URL(`../../public/samples/${name}.tsv`, import.meta.url), "utf8");

function sampleSummary(name: string, periodLength?: number): DataSummary {
  const parsed = parseTransactions(sample(name));
  if (!parsed.ok) {
    throw new Error("sample didn't parse");
  }
  const result = summarise(parsed, "2026-11", periodLength);
  if (!result.ok) {
    throw new Error("sample didn't summarise");
  }
  return result.summary;
}

/** The sample's plan, from the purchase form's fields. */
function samplePlan(name: string, price: number, count: number, periodLength?: number) {
  const s = schedule({ price: c(price), count });
  return assessPlan(sampleSummary(name, periodLength), s.instalments, "2026-11");
}

describe("golden: sample plans (reference 2026-11, values from Python over the awk month totals)", () => {
  it("comfortable, €1,200 × 12: fits on average, but July 2027 leaves −€6.49", () => {
    const result = samplePlan("en_comfortable", 120000, 12);
    expect(result.buffer).toBe(25371);
    expect(result.months.map((m) => [m.month, m.expectedSpending, m.leftover, m.status])).toEqual([
      ["2026-12", 208867, 34846, "fits"],
      ["2027-01", 202319, 41394, "fits"],
      ["2027-02", 202319, 41394, "fits"],
      ["2027-03", 206877, 36836, "fits"],
      ["2027-04", 202319, 41394, "fits"],
      ["2027-05", 202319, 41394, "fits"],
      ["2027-06", 210270, 33443, "fits"],
      ["2027-07", 244362, -649, "no-fit"],
      ["2027-08", 202319, 41394, "fits"],
      ["2027-09", 202319, 41394, "fits"],
      ["2027-10", 207642, 36071, "fits"],
      ["2027-11", 202319, 41394, "fits"],
    ]);
    expect(result.verdict).toBe("no-fit");
  });

  it.each([6, 3])("comfortable, €600 × 12, %i-month period: tight in July 2027 only", (period) => {
    const result = samplePlan("en_comfortable", 60000, 12, period);
    expect(result.months.filter((m) => m.status !== "fits").map((m) => [m.month, m.status])).toEqual([
      ["2027-07", "tight"],
    ]);
    expect(result.verdict).toBe("tight");
  });

  it("tight: even the smallest plan doesn't fit, because December 2026 is over budget", () => {
    const result = samplePlan("en_tight", 2, 2);
    expect(result.months[0]).toMatchObject({ month: "2026-12", spendingSource: "seasonal", status: "no-fit" });
    expect(result.verdict).toBe("no-fit");
  });
});
