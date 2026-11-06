import { describe, expect, it } from "vitest";
import { MAX_INSTALMENTS, MAX_PRICE_CENTS } from "@/lib/constants";
import type { Cents } from "@/lib/money/cents";
import {
  checkPlanForm,
  formatMoneyInput,
  formatRateInput,
  parseCountInput,
  parseMoneyInput,
  parseRateInput,
  type PlanForm,
} from "@/lib/plan/form";

const c = (value: number) => value as Cents;

const form = (overrides: Partial<PlanForm> = {}): PlanForm => ({
  price: "1200",
  upfront: "0",
  count: "12",
  rate: "0",
  fee: "0",
  ...overrides,
});

describe("parseMoneyInput", () => {
  it.each([
    ["1200", 120000],
    ["0", 0],
    ["1200.5", 120050],
    ["1200.50", 120050],
    ["1200,5", 120050],
    ["1200,50", 120050],
    ["1,200", 120000],
    ["1,200.50", 120050],
    ["1.200", 120000],
    ["1.200,50", 120050],
    ["1 200", 120000],
    ["1 200,50", 120050],
    ["€1,200.00", 120000],
    ["1200 €", 120000],
    ["€1200", 120000],
    ["1200€", 120000],
    ["  € 1200  ", 120000],
    ["  99.9  ", 9990],
    [",50", 50],
    ["12.345.678,90", 1234567890],
    // Three digits after the only separator: thousands, not decimals.
    ["12.345", 1234500],
  ])("%j → %d cents", (raw, cents) => {
    expect(parseMoneyInput(raw)).toBe(cents);
  });

  it.each([
    "",
    "   ",
    "abc",
    "-5",
    "+5",
    "1.2.3",
    "1,20,0",
    "1.200.50",
    "1,200,50",
    "5e3",
    "€",
    "12 €€",
    "12€00",
    "€€1200",
    "0x10",
  ])("rejects %j", (raw) => {
    expect(parseMoneyInput(raw)).toBeNull();
  });
});

describe("parseRateInput", () => {
  it.each([
    ["0", 0],
    ["9.9", 990],
    ["9,9", 990],
    ["9.95", 995],
    ["12", 1200],
    ["12%", 1200],
    [" 7.5 % ", 750],
    ["100", 10000],
    ["150", 15000],
    ["0.01", 1],
  ])("%j → %d bps", (raw, bps) => {
    expect(parseRateInput(raw)).toBe(bps);
  });

  it.each(["", "abc", "-1", "9.999", "9.", ".5", "1,000", "9 .9", "9%9"])("rejects %j", (raw) => {
    expect(parseRateInput(raw)).toBeNull();
  });
});

describe("parseCountInput", () => {
  it.each([
    ["12", 12],
    [" 18 ", 18],
    ["060", 60],
  ])("%j → %d", (raw, count) => {
    expect(parseCountInput(raw)).toBe(count);
  });

  it.each(["", "abc", "12.5", "12,0", "-3", "1e2"])("rejects %j", (raw) => {
    expect(parseCountInput(raw)).toBeNull();
  });
});

describe("formatMoneyInput / formatRateInput", () => {
  it.each([
    [120000, "1200"],
    [120050, "1200.50"],
    [120005, "1200.05"],
    [5, "0.05"],
    [0, "0"],
  ])("money %d → %j, and back", (cents, text) => {
    expect(formatMoneyInput(c(cents))).toBe(text);
    expect(parseMoneyInput(text)).toBe(cents);
  });

  it.each([
    [990, "9.9"],
    [995, "9.95"],
    [1200, "12"],
    [1, "0.01"],
    [0, "0"],
    [10000, "100"],
  ])("rate %d bps → %j, and back", (bps, text) => {
    expect(formatRateInput(bps)).toBe(text);
    expect(parseRateInput(text)).toBe(bps);
  });
});

describe("checkPlanForm", () => {
  it("turns valid text into a plan input and its schedule", () => {
    const result = checkPlanForm(form({ price: "1,890.00", upfront: "290", rate: "9.9", fee: "2,50" }));
    expect(result).toEqual({
      ok: true,
      input: { price: 189000, upfront: 29000, count: 12, annualRateBps: 990, monthlyFee: 250 },
      schedule: expect.objectContaining({ financed: 160000, interest: 8708, fees: 3000 }) as unknown,
    });
  });

  it("reads empty upfront, rate and fee as 0", () => {
    const result = checkPlanForm(form({ upfront: " ", rate: "", fee: "" }));
    expect(result.ok && result.input).toEqual({
      price: 120000,
      upfront: 0,
      count: 12,
      annualRateBps: 0,
      monthlyFee: 0,
    });
  });

  it("requires a price and a count", () => {
    expect(checkPlanForm(form({ price: "", count: "  " }))).toEqual({
      ok: false,
      errors: [
        { field: "price", code: "required" },
        { field: "count", code: "required" },
      ],
    });
  });

  it("reports unreadable text on every field, in form order", () => {
    expect(checkPlanForm({ price: "x", upfront: "x", count: "x", rate: "x", fee: "x" })).toEqual({
      ok: false,
      errors: [
        { field: "price", code: "invalid" },
        { field: "upfront", code: "invalid" },
        { field: "count", code: "invalid" },
        { field: "annualRateBps", code: "invalid" },
        { field: "monthlyFee", code: "invalid" },
      ],
    });
  });

  it.each([
    ["price", "price"],
    ["upfront", "upfront"],
    ["rate", "annualRateBps"],
    ["fee", "monthlyFee"],
  ] as const)("reports an unreadable %s on its own", (key, field) => {
    expect(checkPlanForm(form({ [key]: "x" }))).toEqual({ ok: false, errors: [{ field, code: "invalid" }] });
  });

  it("adds no error for empty optional fields when another field fails", () => {
    expect(checkPlanForm({ price: "x", upfront: "", count: "12", rate: "", fee: "" })).toEqual({
      ok: false,
      errors: [{ field: "price", code: "invalid" }],
    });
  });

  it("passes on the range errors of readable values", () => {
    expect(checkPlanForm(form({ price: "100", upfront: "100", count: String(MAX_INSTALMENTS + 1) }))).toEqual({
      ok: false,
      errors: [
        { field: "upfront", code: "too-high" },
        { field: "count", code: "too-high" },
      ],
    });
    expect(checkPlanForm(form({ price: formatMoneyInput(c(MAX_PRICE_CENTS + 100)) }))).toEqual({
      ok: false,
      errors: [{ field: "price", code: "too-high" }],
    });
  });

  it("checks ranges only once every field is readable", () => {
    // The upfront would be too high, but the unreadable count is reported alone first.
    expect(checkPlanForm(form({ price: "100", upfront: "200", count: "x" }))).toEqual({
      ok: false,
      errors: [{ field: "count", code: "invalid" }],
    });
  });
});
