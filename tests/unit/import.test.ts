import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { classify, type Classified } from "@/lib/import/classify";
import { parseDate, parseTransactions } from "@/lib/import/parse";
import { readFile } from "@/lib/import/read-file";
import type { Row } from "@/lib/import/types";
import { MAX_FILE_BYTES } from "@/lib/constants";
import { REQUIRED_COLUMNS } from "@/lib/import/format-spec";

const fixture = (name: string) => readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8");
const sample = (name: string) => readFileSync(new URL(`../../public/samples/${name}.tsv`, import.meta.url), "utf8");

/** Builds a minimal tab-separated file: the six required columns, then `rows`. */
const tsv = (...rows: string[][]) =>
  [["Date", "Payee", "Category Group", "Category", "Outflow", "Inflow"], ...rows].map((r) => r.join("\t")).join("\r\n");

function parsed(text: string): { rows: Row[]; decimal: string } {
  const result = parseTransactions(text);
  if (!result.ok) {
    throw new Error(`expected rows, got ${JSON.stringify(result.error)}`);
  }
  return { rows: result.rows, decimal: result.decimal };
}

function failed(text: string) {
  const result = parseTransactions(text);
  if (result.ok) {
    throw new Error("expected an import error");
  }
  return result.error;
}

const BASE_ROWS: Row[] = [
  {
    line: 2,
    date: "2026-10-31",
    payee: "Rimi",
    group: "Food & Drink",
    category: "Groceries",
    outflow: 5140,
    inflow: 0,
  },
  { line: 3, date: "2026-10-28", payee: "Transfer : SEB Credit", group: "", category: "", outflow: 25000, inflow: 0 },
  {
    line: 4,
    date: "2026-10-25",
    payee: "Employer",
    group: "Inflow",
    category: "Ready to Assign",
    outflow: 0,
    inflow: 246587,
  },
  // its memo holds a quoted newline, so the next row starts on line 7
  {
    line: 5,
    date: "2026-10-03",
    payee: "Hardware store",
    group: "Home",
    category: "Repairs",
    outflow: 123456,
    inflow: 0,
  },
  { line: 7, date: "2026-10-01", payee: "Shop", group: "Lifestyle", category: "Clothes", outflow: 0, inflow: 2000 },
] as Row[];

describe("parseTransactions: accepted variants", () => {
  it("reads the base file: quoted fields, tab-separated, CRLF, decimal comma", () => {
    expect(parsed(fixture("base.tsv"))).toEqual({ rows: BASE_ROWS, decimal: "," });
  });

  it.each(["utf8-bom.tsv", "lf-endings.tsv"])("%s gives the same rows", (name) => {
    expect(parsed(fixture(name))).toEqual({ rows: BASE_ROWS, decimal: "," });
  });

  it("a comma-separated file with €1,234.56 amounts gives the same rows", () => {
    expect(parsed(fixture("dot-decimal.csv"))).toEqual({ rows: BASE_ROWS, decimal: "." });
  });

  it("drops a leading byte-order mark, so a required first column still matches", () => {
    expect(parsed(`\uFEFF${tsv(["31/10/2026", "A", "G", "C", "1,00", "0,00"])}`).rows).toHaveLength(1);
  });

  it("keeps the same character when it's inside a value", () => {
    const { rows } = parsed(tsv(["31/10/2026", "Ri\uFEFFmi", "G", "C", "1,00", "0,00"]));
    expect(rows[0]?.payee).toBe("Ri\uFEFFmi");
  });

  it("reads large amounts exactly", () => {
    expect(parsed(fixture("large-amounts.tsv")).rows[0]?.outflow).toBe(999999999);
  });

  it("matches required columns by name, in any order, ignoring extra columns and padding", () => {
    const text = [
      " Inflow \tExtra\tOutflow\tCategory\tCategory Group\tPayee\tDate",
      "0.00\tx\t5.00\tGroceries\tFood\tRimi\t31/10/2026",
    ].join("\n");
    expect(parsed(text).rows).toEqual([
      { line: 2, date: "2026-10-31", payee: "Rimi", group: "Food", category: "Groceries", outflow: 500, inflow: 0 },
    ]);
  });

  it("trims text fields", () => {
    const { rows } = parsed(tsv(["31/10/2026", "  Rimi ", " Food ", " Groceries\u00a0", " 5,00 ", "0,00"]));
    expect(rows[0]).toMatchObject({ payee: "Rimi", group: "Food", category: "Groceries", outflow: 500 });
  });

  it("unescapes doubled quotes and keeps a lone quote in an unquoted field", () => {
    const { rows } = parsed(
      tsv(
        ["31/10/2026", '"Joe ""Best"" Shop"', "Food", "Groceries", "1,00", "0,00"],
        ["30/10/2026", 'Joe\'s "shop"', "Food", "Groceries", "1,00", "0,00"],
      ),
    );
    expect(rows.map((r) => r.payee)).toEqual(['Joe "Best" Shop', 'Joe\'s "shop"']);
  });

  it("keeps empty quoted and unquoted fields as empty strings", () => {
    const { rows } = parsed(tsv(["31/10/2026", '""', "", '""', "1,00", "0,00"]));
    expect(rows[0]).toMatchObject({ payee: "", group: "", category: "" });
  });

  it("skips blank lines but keeps physical line numbers", () => {
    const text = `${tsv(["31/10/2026", "A", "G", "C", "1,00", "0,00"])}\r\n\r\n30/10/2026\tB\tG\tC\t2,00\t0,00\r\n\r\n`;
    expect(parsed(text).rows.map((r) => [r.line, r.payee])).toEqual([
      [2, "A"],
      [4, "B"],
    ]);
  });

  it("takes the decimal separator from the last separator in the first Outflow", () => {
    expect(parsed(tsv(["31/10/2026", "A", "G", "C", "1.234,56", "0,00"])).decimal).toBe(",");
    expect(parsed(tsv(["31/10/2026", "A", "G", "C", "1,234.56", "0.00"])).decimal).toBe(".");
    expect(parsed(tsv(["31/10/2026", "A", "G", "C", "€ 1 234.56", "0.00"])).decimal).toBe(".");
  });
});

describe("parseTransactions: errors", () => {
  it.each([
    ["empty.tsv", "a 0-byte file"],
    ["header-only.tsv", "a header without rows"],
  ])("%s (%s) has no transactions", (name) => {
    expect(failed(fixture(name))).toEqual({ code: "empty" });
  });

  it("a whitespace-only file has no transactions", () => {
    expect(failed(" \r\n\t\r\n")).toEqual({ code: "empty" });
  });

  it("lists exactly the missing required columns, in format order", () => {
    expect(failed(fixture("other-bank.csv"))).toEqual({
      code: "missing-columns",
      missing: ["Payee", "Category Group", "Category", "Outflow", "Inflow"],
    });
  });

  it("matches column names exactly, not case-insensitively", () => {
    const text = "date\tPayee\tCategory Group\tCategory\tOutflow\tInflow\r\n31/10/2026\tA\tG\tC\t1,00\t0,00";
    expect(failed(text)).toEqual({ code: "missing-columns", missing: ["Date"] });
  });

  it("reports a date in another format with its line", () => {
    expect(failed(fixture("bad-date.tsv"))).toEqual({ code: "bad-date", line: 3, value: "2026-10-30" });
  });

  it.each([
    ["12,3", "0,00", "Outflow", "12,3"],
    ["1,00", "abc", "Inflow", "abc"],
    ["", "0,00", "Outflow", ""],
    ["-1,00", "0,00", "Outflow", "-1,00"],
  ])("reports a bad amount (%j, %j) with its line and column", (outflow, inflow, column, value) => {
    expect(failed(tsv(["31/10/2026", "A", "G", "C", outflow, inflow]))).toEqual({
      code: "bad-amount",
      line: 2,
      column,
      value,
    });
  });

  it("rejects an amount that uses the other decimal separator than the rest of the file", () => {
    const text = tsv(["31/10/2026", "A", "G", "C", "51,40", "0,00"], ["30/10/2026", "B", "G", "C", "12.00", "0,00"]);
    expect(failed(text)).toEqual({ code: "bad-amount", line: 3, column: "Outflow", value: "12.00" });
  });

  it("rejects amounts beyond the safe-integer range", () => {
    const text = tsv(["31/10/2026", "A", "G", "C", "90 071 992 547 409,92", "0,00"]);
    expect(failed(text)).toMatchObject({ code: "bad-amount", line: 2 });
  });

  it.each([
    ["too few fields", tsv(["31/10/2026", "A", "G", "C", "1,00"]), 2],
    ["too many fields", tsv(["31/10/2026", "A", "G", "C", "1,00", "0,00", "x"]), 2],
    [
      "an unterminated quote (reported where it opens)",
      `${tsv(["31/10/2026", "A", "G", "C", "1,00", "0,00"], ['"30/10/2026', "B"])}\r\nmore`,
      3,
    ],
    ["a quote that opens at the very end", `${tsv(["31/10/2026", "A", "G", "C", "1,00", "0,00"])}\r\n"`, 3],
    ["an unclosed quote right before a delimiter", tsv(["31/10/2026", '"\tA', "G", "C", "1,00", "0,00"]), 2],
    ["text after a closing quote", tsv(["31/10/2026", '"A"x', "G", "C", "1,00", "0,00"]), 2],
    ["text after a closing quote in the last field", tsv(["31/10/2026", "A", "G", "C", "1,00", '"0,00"x']), 2],
    [
      "a misaligned row after a multi-line field",
      tsv(["31/10/2026", '"A\r\nB"', "G", "C", "1,00", "0,00"], ["30/10/2026", "B"]),
      4,
    ],
  ])("reports a malformed line: %s", (_, text, line) => {
    expect(failed(text)).toEqual({ code: "malformed", line });
  });

  it("reports the first problem in the file", () => {
    const text = tsv(["31-10-2026", "A", "G", "C", "1", "0,00"], ["30/10/2026", "B", "G", "C", "x", "0,00"]);
    expect(failed(text)).toEqual({ code: "bad-date", line: 2, value: "31-10-2026" });
  });
});

describe("parseDate", () => {
  it.each([
    ["31/10/2026", "2026-10-31"],
    ["01/01/2026", "2026-01-01"],
    ["31/12/2026", "2026-12-31"],
    ["29/02/2028", "2028-02-29"],
    ["30/04/2026", "2026-04-30"],
  ])("%s → %s", (raw, iso) => {
    expect(parseDate(raw)).toBe(iso);
  });

  it.each([
    "29/02/2026", // not a leap year
    "31/04/2026",
    "32/01/2026",
    "00/10/2026",
    "01/00/2026",
    "01/13/2026",
    "1/10/2026",
    "01/1/2026",
    "31/10/26",
    "2026-10-31",
    "31.10.2026",
    "31/10/2026x",
    " 31/10/2026",
    "",
  ])("rejects %j", (raw) => {
    expect(parseDate(raw)).toBeNull();
  });
});

describe("classify", () => {
  const kinds = (name: string) =>
    parsed(fixture(name)).rows.map((row) => {
      const c: Classified = classify(row);
      if (c.kind === "income") {
        return ["income", c.amount];
      }
      if (c.kind === "spending") {
        return ["spending", `${c.group}/${c.category}`, c.net];
      }
      return [c.kind, c.reason];
    });

  it("classifies the base file", () => {
    expect(kinds("base.tsv")).toEqual([
      ["spending", "Food & Drink/Groceries", 5140],
      ["excluded", "transfer"],
      ["income", 246587],
      ["spending", "Home/Repairs", 123456],
      ["spending", "Lifestyle/Clothes", -2000],
    ]);
  });

  it("splits: each line counts in its own category; a transfer leg is excluded", () => {
    expect(kinds("splits.tsv")).toEqual([
      ["spending", "Food & Drink/Groceries", 4000],
      ["spending", "Home/Household", 1550],
      ["excluded", "transfer"],
    ]);
  });

  it("transfers between budget accounts are excluded; a categorised transfer out of the budget is spending", () => {
    expect(kinds("transfers.tsv")).toEqual([
      ["excluded", "transfer"],
      ["excluded", "transfer"],
      ["spending", "Home/Mortgage", 65000],
    ]);
  });

  it("card payments are excluded, even though the payee looks like a transfer", () => {
    expect(kinds("card-payment.tsv")).toEqual([["excluded", "card-payment"]]);
  });

  it("opening balances are excluded, even when filed as income", () => {
    expect(kinds("opening-balance.tsv")).toEqual([
      ["excluded", "opening-balance"],
      ["excluded", "opening-balance"],
    ]);
  });

  it("a refund lowers its category, which may go below zero", () => {
    expect(kinds("refund.tsv")).toEqual([
      ["spending", "Lifestyle/Clothes", 8000],
      ["spending", "Lifestyle/Clothes", -10000],
    ]);
  });

  const row = (payee: string, group: string, outflow: number, inflow: number) =>
    ({ line: 2, date: "2026-10-31", payee, group, category: "X", outflow, inflow }) as Row;

  it.each([
    ["Inflow", "income"],
    ["inflow", "income"],
    ["INFLOW", "income"],
    ["Credit Card Payments", "card-payment"],
    ["credit card payments", "card-payment"],
    ["", "uncategorised"],
    ["Inflows", "spending"],
  ])("group %j → %s", (group, expected) => {
    const c = classify(row("Someone", group, 100, 0));
    expect(c.kind === "excluded" ? c.reason : c.kind).toBe(expected);
  });

  it("income is inflow minus outflow", () => {
    expect(classify(row("Employer", "Inflow", 500, 2000))).toEqual({
      kind: "income",
      row: row("Employer", "Inflow", 500, 2000),
      amount: 1500,
    });
    expect(classify(row("Employer", "Inflow", 500, 0))).toMatchObject({ amount: -500 });
  });

  it("only the exact transfer prefix and opening-balance payee count", () => {
    expect(classify(row("Transfer: Savings", "", 100, 0))).toMatchObject({ kind: "excluded", reason: "uncategorised" });
    expect(classify(row("Transfers : Savings", "Home", 100, 0))).toMatchObject({ kind: "spending" });
    expect(classify(row("starting balance", "Inflow", 0, 100))).toMatchObject({ kind: "income" });
    expect(classify(row("Starting Balance ", "Inflow", 0, 100))).toMatchObject({ kind: "income" });
  });
});

describe("sample files", () => {
  const SAMPLES = ["en_comfortable", "en_tight", "et_comfortable", "et_tight"] as const;

  it.each(SAMPLES)("%s parses completely", (name) => {
    const text = sample(name);
    const { rows, decimal } = parsed(text);
    expect(rows).toHaveLength(text.trimEnd().split("\r\n").length - 1);
    expect(decimal).toBe(name.startsWith("en") ? "." : ",");
  });

  it.each(["comfortable", "tight"])("the en and et %s files hold the same dates and amounts", (profile) => {
    const key = (r: Row) => [r.date, r.outflow, r.inflow];
    expect(parsed(sample(`en_${profile}`)).rows.map(key)).toEqual(parsed(sample(`et_${profile}`)).rows.map(key));
  });

  it("comfortable: classification counts match the file", () => {
    const counts: Record<string, number> = {};
    for (const row of parsed(sample("en_comfortable")).rows) {
      const c = classify(row);
      const key = c.kind === "excluded" ? c.reason : c.kind;
      counts[key] = (counts[key] ?? 0) + 1;
    }
    // 575 data rows (the file has no trailing newline); 26 in the Inflow group, 24 transfers.
    expect(counts).toEqual({ income: 26, transfer: 24, spending: 575 - 26 - 24 });
  });
});

describe("template file", () => {
  // The error screen offers this file for download; it must stay in step with the format.
  const template = readFileSync(new URL("../../public/transactions-template.csv", import.meta.url), "utf8");

  it("has exactly the required columns, in their documented order", () => {
    expect(template.split("\r\n")[0]).toBe(REQUIRED_COLUMNS.join(","));
  });

  it("parses, with income and spending rows", () => {
    const kinds = new Set(parsed(template).rows.map((row) => classify(row).kind));
    expect(kinds).toEqual(new Set(["income", "spending"]));
  });
});

describe("readFile", () => {
  const blob = (...parts: (string | Uint8Array)[]) => new Blob(parts as BlobPart[]);

  it("returns the text of a UTF-8 file", async () => {
    expect(await readFile(blob("Date\tPayee\r\nõun"))).toEqual({ ok: true, text: "Date\tPayee\r\nõun" });
  });

  it("drops a byte-order mark", async () => {
    expect(await readFile(blob(new Uint8Array([0xef, 0xbb, 0xbf]), "Date"))).toEqual({ ok: true, text: "Date" });
  });

  it("accepts an empty file (parsing then reports it as empty)", async () => {
    expect(await readFile(blob())).toEqual({ ok: true, text: "" });
  });

  it("accepts a file of exactly the size limit", async () => {
    const result = await readFile(blob("a".repeat(MAX_FILE_BYTES)));
    expect(result.ok).toBe(true);
  });

  it("rejects a larger file without reading it", async () => {
    const big = blob("a".repeat(MAX_FILE_BYTES + 1));
    big.arrayBuffer = () => Promise.reject(new Error("should not be read"));
    expect(await readFile(big)).toEqual({ ok: false, error: { code: "too-large" } });
  });

  it.each([
    ["a NUL byte (binary formats like spreadsheets and zips)", new Uint8Array([0x44, 0x00, 0x61])],
    ["invalid UTF-8 (images, PDFs, legacy encodings)", new Uint8Array([0x44, 0xff, 0x61])],
  ])("rejects %s as not text", async (_, bytes) => {
    expect(await readFile(blob(bytes))).toEqual({ ok: false, error: { code: "not-text" } });
  });
});
