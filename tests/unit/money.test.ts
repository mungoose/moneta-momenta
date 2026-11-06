import { describe, expect, it } from "vitest";
import { InvalidAmountError, divRound, parseAmount, sum, toCents, type Cents } from "@/lib/money/cents";
import { formatCents } from "@/lib/money/format";

const MAX = Number.MAX_SAFE_INTEGER; // 9 007 199 254 740 991
const NBSP = "\u00a0";
const NNBSP = "\u202f";
const c = (n: number) => n as Cents;

describe("toCents", () => {
  it.each([0, 5, -5, MAX, -MAX])("accepts the safe integer %d", (n) => {
    expect(toCents(n)).toBe(n);
  });

  it.each([1.5, 0.1, Number.NaN, Infinity, -Infinity, MAX + 1, -MAX - 1])("rejects %d", (n) => {
    expect(() => toCents(n)).toThrow(RangeError);
  });
});

describe("divRound", () => {
  it.each([
    // exact
    [6, 3, 2],
    [0, 5, 0],
    [MAX, 1, MAX],
    // below half: toward zero
    [1, 3, 0],
    [-1, 3, 0],
    [-1, -3, 0], // must be +0, not -0
    [9, 4, 2],
    [-9, 4, -2],
    // above half: away from zero
    [2, 3, 1],
    [-2, 3, -1],
    [11, 4, 3],
    [-11, 4, -3],
    // exact .5: away from zero in every sign combination (Math.round(-3.5) is -3)
    [7, 2, 4],
    [-7, 2, -4],
    [7, -2, -4],
    [-7, -2, 4],
    [10, 4, 3],
    [-10, 4, -3],
    [5, 2, 3],
    [3, 2, 2],
    // large values where a float quotient is already rounded:
    // MAX / 3 = …330.333, but the double nearest to it is …330.5
    [MAX, 3, 3002399751580330],
    [-MAX, 3, -3002399751580330],
    [MAX, 2, 4503599627370496],
    [MAX - 1, 2, 4503599627370495],
    // the buffer rule from TECH-PLAN §6: 10% of €2,537.13
    [253713 * 1000, 10000, 25371],
  ])("divRound(%d, %d) = %d", (a, b, expected) => {
    expect(divRound(a, b)).toBe(expected);
  });

  it("rejects division by zero", () => {
    expect(() => divRound(5, 0)).toThrow(RangeError);
    expect(() => divRound(0, 0)).toThrow(RangeError);
  });

  it.each([
    [1.5, 2],
    [2, 1.5],
    [MAX + 1, 2],
    [2, MAX + 1],
    [Number.NaN, 1],
  ])("rejects non-safe-integer operands (%d, %d)", (a, b) => {
    expect(() => divRound(a, b)).toThrow(RangeError);
  });
});

describe("sum", () => {
  it("adds cents exactly", () => {
    expect(sum([])).toBe(0);
    expect(sum([c(100), c(-50), c(25)])).toBe(75);
    expect(sum([c(MAX - 1), c(1)])).toBe(MAX);
  });

  it("rejects a total beyond safe integers", () => {
    expect(() => sum([c(MAX), c(1)])).toThrow(RangeError);
    expect(() => sum([c(-MAX), c(-1)])).toThrow(RangeError);
  });
});

describe("parseAmount", () => {
  it.each([
    "2465,87",
    "2 465,87",
    "2.465,87",
    "2 465,87 €",
    `2${NBSP}465,87${NBSP}€`,
    `2${NNBSP}465,87${NNBSP}€`,
    "€2465,87",
    "€ 2.465,87",
    "  2465,87\t",
  ])("decimal comma: %j → 246587", (raw) => {
    expect(parseAmount(raw, ",")).toBe(246587);
  });

  it.each(["2465.87", "2,465.87", "€2,465.87", "€ 2,465.87", "2 465.87 €", `2${NBSP}465.87`])(
    "decimal dot: %j → 246587",
    (raw) => {
      expect(parseAmount(raw, ".")).toBe(246587);
    },
  );

  it.each([
    ["0,00", 0],
    ["0,05", 5],
    ["51,40", 5140],
    ["1.000,00", 100000],
    ["9 999 999,99 €", 999999999],
    ["1.234.567,89", 123456789],
    ["90 071 992 547 409,91", MAX],
  ])("%j → %d", (raw, expected) => {
    expect(parseAmount(raw, ",")).toBe(expected);
  });

  it.each([
    // empty or no number
    "",
    "   ",
    "€",
    "abc",
    // not exactly two decimals
    "2465",
    "2465,8",
    "2465,875",
    "12,3",
    "2465,",
    // the other decimal separator, i.e. inconsistent with the file
    "2465.87",
    "2,465.87",
    // misplaced or mixed thousands separators
    "24.65,87",
    "1.2345,00",
    "1 234.567,00",
    ".246,87",
    "2..465,87",
    "2465,87.",
    // signs: Outflow and Inflow are never negative
    "-5,00",
    "+5,00",
    "5,00-",
    "\u22125,00",
    // other currencies, doubled symbols, other notations
    "5,00 €€",
    "€5,00 €",
    "12,34 USD",
    "$12,34",
    "1e3,00",
    "0x10,00",
    "Infinity",
    "١٢,٣٤",
    // beyond safe integers
    "90 071 992 547 409,92",
    "999 999 999 999 999 999,00",
  ])("decimal comma rejects %j", (raw) => {
    expect(() => parseAmount(raw, ",")).toThrow(InvalidAmountError);
  });

  it.each(["2465,87", "2.465,87", "2465"])("decimal dot rejects %j", (raw) => {
    expect(() => parseAmount(raw, ".")).toThrow(InvalidAmountError);
  });

  it("keeps the raw text on the error for line-numbered messages, but out of its message", () => {
    try {
      parseAmount("12,3", ",");
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidAmountError);
      const amountError = error as InvalidAmountError;
      expect(amountError.raw).toBe("12,3");
      expect(amountError.name).toBe("InvalidAmountError");
      // A transaction amount must never reach a log line through `message`.
      expect(amountError.message).toBe("Not a valid amount");
    }
  });
});

describe("formatCents", () => {
  it.each([
    [120000, "€1,200.00"],
    [246587, "€2,465.87"],
    [5, "€0.05"],
    [0, "€0.00"],
    [-649, "-€6.49"],
    [-5, "-€0.05"],
    [MAX, "€90,071,992,547,409.91"],
  ])("en: %d → %j", (value, expected) => {
    expect(formatCents(c(value), "en")).toBe(expected);
  });

  it.each([
    // Estonian doesn't group 4-digit numbers (CLDR minimum grouping digits = 2)
    [120000, `1200,00${NBSP}€`],
    [123456789, `1${NBSP}234${NBSP}567,89${NBSP}€`],
    [5, `0,05${NBSP}€`],
    [0, `0,00${NBSP}€`],
    [-649, `\u22126,49${NBSP}€`],
    [MAX, `90${NBSP}071${NBSP}992${NBSP}547${NBSP}409,91${NBSP}€`],
  ])("et: %d → %j", (value, expected) => {
    expect(formatCents(c(value), "et")).toBe(expected);
  });

  it("never shows a negative zero", () => {
    expect(formatCents(c(-0), "en")).toBe("€0.00");
  });

  it.each([0, 5, 99, 100, 120000, 246587, 999999999, MAX])("round-trips %d through parseAmount", (value) => {
    expect(parseAmount(formatCents(c(value), "en"), ".")).toBe(value);
    expect(parseAmount(formatCents(c(value), "et"), ",")).toBe(value);
  });
});
