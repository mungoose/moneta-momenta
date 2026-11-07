import { describe, expect, it } from "vitest";
import { addMonths } from "@/lib/budget/months";
import { summarise } from "@/lib/budget/summary";
import { guardRange } from "@/lib/guard";
import { parseTransactions } from "@/lib/import/parse";
import type { Cents } from "@/lib/money/cents";
import { assessPlan } from "@/lib/plan/affordability";

/** Builds a minimal tab-separated file: the six required columns, then `rows`. */
const tsv = (...rows: string[][]) =>
  [["Date", "Payee", "Category Group", "Category", "Outflow", "Inflow"], ...rows].map((r) => r.join("\t")).join("\r\n");

const HUGE = "45035996273704,96"; // 2^52 cents: one fits a month, two pass 2^53
const salary = (date: string, amount = "2000,00") => [date, "Employer", "Inflow", "Ready to Assign", "0,00", amount];
const spend = (date: string, amount: string) => [date, "Shop", "Home", "Purchase", amount, "0,00"];

/** `DD/MM/YYYY` for the given day of a `YYYY-MM` month. */
const day = (dd: string, month: string) => `${dd}/${month.slice(5)}/${month.slice(0, 4)}`;

/** Salary on the 1st of each of the 12 full months before November 2026, plus `extra` rows. */
function year(...extra: string[][]) {
  const months = Array.from({ length: 12 }, (_, i) => addMonths("2025-11", i));
  const file = parseTransactions(tsv(...months.map((m) => salary(day("01", m))), ...extra));
  if (!file.ok) {
    throw new Error(`fixture doesn't parse: ${file.error.code}`);
  }
  return file;
}

describe("guardRange", () => {
  it("passes a calculation's result through", () => {
    expect(guardRange(() => 42)).toEqual({ ok: true, value: 42 });
  });

  it("turns a RangeError into a failed result", () => {
    expect(
      guardRange(() => {
        throw new RangeError("Not a safe integer number of cents");
      }),
    ).toEqual({ ok: false });
  });

  it("rethrows any other error: that is a bug, not an amount too large", () => {
    const bug = new TypeError("x is undefined");
    expect(() =>
      guardRange(() => {
        throw bug;
      }),
    ).toThrow(bug);
  });

  it("catches a summary whose period adds up past the safe-integer range", () => {
    // Each month's total fits, and the default 6 months leave out January and February.
    const file = year(spend("15/01/2026", HUGE), spend("15/02/2026", HUGE));
    expect(guardRange(() => summarise(file, "2026-11")).ok).toBe(true);
    expect(guardRange(() => summarise(file, "2026-11", 12))).toEqual({ ok: false });
  });

  it("catches a plan whose buffer can't be worked out from a huge income", () => {
    const summary = summarise(year(salary("02/10/2026", HUGE)), "2026-11");
    if (!summary.ok) {
      throw new Error(`expected a summary, got ${summary.error.code}`);
    }
    expect(guardRange(() => assessPlan(summary.summary, [10000 as Cents], "2026-11"))).toEqual({ ok: false });
  });
});
