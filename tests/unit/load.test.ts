import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { summarise } from "@/lib/budget/summary";
import { MAX_FILE_BYTES, SAMPLE_REFERENCE_MONTH } from "@/lib/constants";
import { parseTransactions } from "@/lib/import/parse";
import { loadFile, loadText, outdatedEnd, type LoadResult } from "@/lib/load";

const fixture = (name: string) => readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8");
const sample = (name: string) => readFileSync(new URL(`../../public/samples/${name}.tsv`, import.meta.url), "utf8");

/** Builds a minimal tab-separated file: the six required columns, then `rows`. */
const tsv = (...rows: string[][]) =>
  [["Date", "Payee", "Category Group", "Category", "Outflow", "Inflow"], ...rows].map((r) => r.join("\t")).join("\r\n");

const salary = (date: string) => [date, "Employer", "Inflow", "Ready to Assign", "0,00", "2000,00"];
const spend = (date: string) => [date, "Shop", "Food & Drink", "Groceries", "100,00", "0,00"];

function loaded(result: LoadResult) {
  if (!result.ok) {
    throw new Error(`expected data, got ${JSON.stringify(result.error)}`);
  }
  return result.data;
}

describe("loadText", () => {
  it("returns the parsed file, its reference month and its full-month count", () => {
    const text = sample("en_comfortable");
    const file = parseTransactions(text);
    expect(loadText(text, SAMPLE_REFERENCE_MONTH)).toEqual({
      ok: true,
      data: { file, reference: SAMPLE_REFERENCE_MONTH, fullMonthCount: 12 },
    });
  });

  it("counts full months against the reference month it's given", () => {
    // The same sample seen from October 2026: October is unfinished, so 11 full months remain.
    expect(loaded(loadText(sample("en_comfortable"), "2026-10")).fullMonthCount).toBe(11);
  });

  it("counts every full month, not just the default period's", () => {
    // 4 full months (Jul–Oct 2026): fewer than the default 6, so the default period is all 4.
    const data = loaded(loadText(fixture("no-income-month.tsv"), "2026-11"));
    expect(data.fullMonthCount).toBe(4);
  });

  it.each([
    ["empty.tsv", { code: "empty" }],
    ["header-only.tsv", { code: "empty" }],
    ["bad-date.tsv", { code: "bad-date", line: 3, value: "2026-10-30" }],
    [
      "other-bank.csv",
      {
        code: "missing-columns",
        missing: ["Payee", "Category Group", "Category", "Outflow", "Inflow"],
        found: ["Date", "Description", "Amount", "Balance"],
      },
    ],
  ])("passes the parser's error through for %s", (name, error) => {
    expect(loadText(fixture(name), "2026-11")).toEqual({ ok: false, error });
  });

  it("passes the summary's too-little-data error through, with the unfinished months", () => {
    const text = tsv(spend("02/11/2026"), salary("25/10/2026"), spend("01/10/2026"), salary("25/09/2026"));
    expect(loadText(text, "2026-11")).toEqual({
      ok: false,
      error: { code: "too-little-data", fullMonths: 2, droppedMonths: [{ month: "2026-11", why: "current" }] },
    });
  });

  it("passes the summary's no-income error through", () => {
    const text = tsv(spend("01/10/2026"), spend("01/09/2026"), spend("01/08/2026"));
    expect(loadText(text, "2026-11")).toEqual({ ok: false, error: { code: "no-income" } });
  });

  it("checks income over the default period, as the summary first shows it", () => {
    // Income only in July; August–January have none. The default 6-month period has no income.
    const months = ["08/2026", "09/2026", "10/2026", "11/2026", "12/2026", "01/2027"];
    const text = tsv(salary("25/07/2026"), ...months.map((m) => spend(`01/${m}`)));
    const result = loadText(text, "2027-02");
    expect(result).toEqual({ ok: false, error: { code: "no-income" } });
    // The same file is fine once July is in the period, so the check is the default period's, not the file's.
    const file = parseTransactions(text);
    expect(file.ok && summarise(file, "2027-02", 7)).toMatchObject({ ok: true });
  });
});

describe("loadFile", () => {
  const blob = (...parts: (string | Uint8Array)[]) => new Blob(parts as BlobPart[]);

  it("reads the file and loads its text", async () => {
    const text = sample("et_tight");
    expect(await loadFile(blob(text), SAMPLE_REFERENCE_MONTH)).toEqual(loadText(text, SAMPLE_REFERENCE_MONTH));
    expect((await loadFile(blob(text), SAMPLE_REFERENCE_MONTH)).ok).toBe(true);
  });

  it("drops a byte-order mark before parsing", async () => {
    const text = fixture("three-months.tsv");
    const result = await loadFile(blob(new Uint8Array([0xef, 0xbb, 0xbf]), text), "2026-11");
    expect(loaded(result).fullMonthCount).toBe(3);
  });

  it("refuses a file that isn't text", async () => {
    expect(await loadFile(blob(new Uint8Array([0x44, 0x00, 0x61])), "2026-11")).toEqual({
      ok: false,
      error: { code: "not-text" },
    });
  });

  it("refuses a file over the size limit", async () => {
    expect(await loadFile(blob("a".repeat(MAX_FILE_BYTES + 1)), "2026-11")).toEqual({
      ok: false,
      error: { code: "too-large" },
    });
  });

  it("reports parse errors with their line", async () => {
    expect(await loadFile(blob(fixture("bad-date.tsv")), "2026-11")).toEqual({
      ok: false,
      error: { code: "bad-date", line: 3, value: "2026-10-30" },
    });
  });
});

describe("upload fixtures for the browser tests", () => {
  const e2eFixture = (name: string) => readFileSync(new URL(`../../e2e/fixtures/${name}`, import.meta.url), "utf8");

  it("starts-late.tsv flags November 2025 over 12 months, and loads", () => {
    const data = loaded(loadText(e2eFixture("starts-late.tsv"), "2026-11"));
    const result = summarise(data.file, data.reference, 12);
    expect(result.ok && result.summary.incomplete).toEqual([
      { month: "2025-11", why: "starts-mid-month", firstDate: "2025-11-19" },
    ]);
  });

  it("ends-early.tsv flags October 2026, and loads", () => {
    const data = loaded(loadText(e2eFixture("ends-early.tsv"), "2026-11"));
    const result = summarise(data.file, data.reference);
    expect(result.ok && result.summary.incomplete).toEqual([
      { month: "2026-10", why: "ends-mid-month", lastDate: "2026-10-11" },
    ]);
  });
});

describe("outdatedEnd", () => {
  it.each([
    ["2026-10", "2026-11", null],
    ["2026-09", "2026-11", "2026-09"],
    ["2025-12", "2026-11", "2025-12"],
    ["2026-12", "2027-01", null],
    ["2026-11", "2027-01", "2026-11"],
  ])("last full month %s, reference %s → %s", (last, reference, expected) => {
    expect(outdatedEnd(last, reference)).toBe(expected);
  });
});
