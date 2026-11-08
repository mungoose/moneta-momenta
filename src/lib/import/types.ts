import type { Cents, DecimalSeparator } from "@/lib/money/cents";
import type { RequiredColumn } from "./format-spec";

/** One transaction row from the file, with only the fields the app uses. */
export interface Row {
  /** Physical line in the file where the row starts (1-based; the header is line 1). */
  line: number;
  /** ISO date, `YYYY-MM-DD`. */
  date: string;
  payee: string;
  /** Category group; empty for rows outside the budget (e.g. transfers). */
  group: string;
  category: string;
  outflow: Cents;
  inflow: Cents;
}

/**
 * Why a file couldn't be imported. Each carries just enough for a message
 * that says what to fix. The `code` alone is what telemetry may record.
 */
export type ImportError =
  | { code: "too-large" }
  | { code: "not-text" }
  | { code: "empty" }
  /** `found`: the file's own column names, so the screen can show them beside the required ones. */
  | { code: "missing-columns"; missing: RequiredColumn[]; found: string[] }
  /** Unbalanced quotes or a row with a different number of fields than the header. */
  | { code: "malformed"; line: number }
  | { code: "bad-date"; line: number; value: string }
  | { code: "bad-amount"; line: number; column: "Outflow" | "Inflow"; value: string };

/** A successfully parsed file. */
export interface ParsedFile {
  ok: true;
  rows: Row[];
  /** The decimal separator the file uses, shown in the explanation view. */
  decimal: DecimalSeparator;
}

/** The result of parsing: rows, or the first problem found. */
export type ParseResult = ParsedFile | { ok: false; error: ImportError };
