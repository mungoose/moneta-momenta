import { InvalidAmountError, parseAmount, type Cents, type DecimalSeparator } from "@/lib/money/cents";
import { REQUIRED_COLUMNS, type RequiredColumn } from "./format-spec";
import type { ImportError, ParseResult, Row } from "./types";

/** One record of the file: its fields and the physical line it starts on. */
interface RawRecord {
  line: number;
  fields: string[];
}

/**
 * Splits delimited text into records. Fields may be double-quoted, and a
 * quoted field may hold the delimiter, a newline or `""` (a literal quote).
 * A quote inside an unquoted field is kept as text. Unlike lenient CSV
 * libraries this never repairs bad quoting: it reports where it went wrong,
 * because a silently misaligned row would put amounts in the wrong columns.
 * @param text       File text with `\n` line endings.
 * @param delimiter  Field separator.
 * @returns          Records, or the line of the first malformed one.
 */
function readRecords(text: string, delimiter: string): RawRecord[] | { malformedLine: number } {
  const records: RawRecord[] = [];
  const at: Cursor = { i: 0, line: 1 };
  // Stryker disable next-line EqualityOperator: one more pass at the end only adds a blank record, which the caller skips
  while (at.i < text.length) {
    const recordLine = at.line;
    const fields: string[] = [];
    for (;;) {
      const field = readField(text, delimiter, at);
      if (typeof field !== "string") {
        return field;
      }
      fields.push(field);
      if (text[at.i] !== delimiter) {
        break;
      }
      at.i++;
    }
    at.i++; // past the newline (or past the end)
    at.line++;
    records.push({ line: recordLine, fields });
  }
  return records;
}

/** A read position in the text, and the physical line it is on. */
interface Cursor {
  i: number;
  line: number;
}

/**
 * Reads one field starting at `at`, leaving `at` on the delimiter, newline or
 * end of text after it.
 * @returns The field's value, or the line to report when its quoting is broken:
 *          where an unclosed quote opened, or where text follows a closing quote.
 */
function readField(text: string, delimiter: string, at: Cursor): string | { malformedLine: number } {
  const endsField = () => at.i >= text.length || text[at.i] === delimiter || text[at.i] === "\n";
  if (text[at.i] !== '"') {
    const start = at.i;
    while (!endsField()) {
      at.i++;
    }
    return text.slice(start, at.i);
  }
  const openLine = at.line;
  const value = readQuoted(text, at);
  if (value === null) {
    return { malformedLine: openLine };
  }
  return endsField() ? value : { malformedLine: at.line };
}

/**
 * Reads a quoted field from its opening quote to just past its closing one.
 * `""` inside it is a literal quote; newlines inside it advance `at.line`.
 * @returns The unquoted value, or `null` when the quote never closes.
 */
function readQuoted(text: string, at: Cursor): string | null {
  at.i++;
  let value = "";
  for (;;) {
    const close = text.indexOf('"', at.i);
    if (close === -1) {
      return null;
    }
    const chunk = text.slice(at.i, close);
    value += chunk;
    at.line += chunk.split("\n").length - 1;
    at.i = close + 1;
    if (text[at.i] !== '"') {
      return value;
    }
    value += '"';
    at.i++;
  }
}

const DATE_PATTERN = /^(\d{2})\/(\d{2})\/(\d{4})$/;

/**
 * Parses a `DD/MM/YYYY` date into ISO form, rejecting impossible dates.
 * @param raw  Date text, already trimmed.
 * @returns    `YYYY-MM-DD`, or `null` when `raw` isn't a real date in that format.
 * @example parseDate("29/02/2028") // "2028-02-29"
 * @example parseDate("29/02/2026") // null
 */
export function parseDate(raw: string): string | null {
  // Date format is fixed to DD/MM/YYYY for this demo. For real users: let them
  // pick the format, or infer it from the file (a part > 12 settles DMY vs MDY), here.
  const match = DATE_PATTERN.exec(raw);
  if (!match) {
    return null;
  }
  // All three groups are mandatory in the pattern, so they're always set.
  const [, dd, mm, yyyy] = match as unknown as [string, string, string, string];
  const day = Number(dd);
  const month = Number(mm);
  // Day 0 of the next month is the last day of this one.
  const daysInMonth = new Date(Date.UTC(Number(yyyy), month, 0)).getUTCDate();
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth) {
    return null;
  }
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * The decimal separator of a file, from the first row's Outflow cell. A valid
 * amount always ends in a separator and two digits, so its last `.` or `,` is
 * the decimal one. If that cell is invalid the guess doesn't matter: the cell
 * is rejected whichever separator is used.
 */
function detectDecimal(amount: string): DecimalSeparator {
  // Stryker disable next-line EqualityOperator: the positions are only equal (-1) when there's no separator, and then the cell is rejected either way
  return amount.lastIndexOf(".") > amount.lastIndexOf(",") ? "." : ",";
}

/** Parses one amount cell, turning a rejection into a line-numbered error. */
function readAmount(
  value: string,
  decimal: DecimalSeparator,
  line: number,
  column: "Outflow" | "Inflow",
): Cents | ImportError {
  try {
    return parseAmount(value, decimal);
  } catch (error) {
    // parseAmount throws nothing else; a programming error must not be reported as a bad amount
    // Stryker disable next-line ConditionalExpression,BlockStatement: unreachable in tests for that reason
    if (!(error instanceof InvalidAmountError)) {
      throw error;
    }
    return { code: "bad-amount", line, column, value };
  }
}

/**
 * Parses transaction file text into rows, checking every value.
 * Tab- or comma-separated (decided by the header line), UTF-8 with or without
 * a byte-order mark, CRLF or LF line endings. Blank lines are skipped.
 * @param text  The whole file as text.
 * @returns     All rows with their decimal separator, or the first problem found.
 * @example parseTransactions("Date\tPayee\t…") // { ok: true, rows: [...], decimal: "," }
 */
export function parseTransactions(text: string): ParseResult {
  const fail = (error: ImportError): ParseResult => ({ ok: false, error });
  const normalised = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  // A tab anywhere in the header line makes the file tab-separated.
  const delimiter = /^[^\n]*\t/.test(normalised) ? "\t" : ",";

  const read = readRecords(normalised, delimiter);
  if (!Array.isArray(read)) {
    return fail({ code: "malformed", line: read.malformedLine });
  }
  const table = readHeader(read.filter((r) => r.fields.some((f) => f.trim() !== "")));
  if ("code" in table) {
    return fail(table);
  }

  let decimal: DecimalSeparator | undefined;
  const rows: Row[] = [];
  for (const record of table.data) {
    if (record.fields.length !== table.names.length) {
      return fail({ code: "malformed", line: record.line });
    }
    const cell = (column: RequiredColumn) =>
      // The field count matches the header, so every required column has a cell.
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      record.fields[table.names.indexOf(column)]!.trim();
    decimal ??= detectDecimal(cell("Outflow"));
    const row = readRow(cell, record.line, decimal);
    if ("code" in row) {
      return fail(row);
    }
    rows.push(row);
  }
  // `data` is non-empty, so the first row has set it.
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return { ok: true, rows, decimal: decimal! };
}

/**
 * Splits the non-blank records into the header's column names and the data,
 * checking that every required column is there and that there is data.
 */
function readHeader(records: RawRecord[]): { names: string[]; data: RawRecord[] } | ImportError {
  const [header, ...data] = records;
  if (!header) {
    return { code: "empty" };
  }
  const names = header.fields.map((f) => f.trim());
  const missing = REQUIRED_COLUMNS.filter((c) => !names.includes(c));
  if (missing.length > 0) {
    return { code: "missing-columns", missing, found: names.filter((name) => name !== "") };
  }
  return data.length === 0 ? { code: "empty" } : { names, data };
}

/** Checks and converts one record's cells into a row. */
function readRow(cell: (column: RequiredColumn) => string, line: number, decimal: DecimalSeparator): Row | ImportError {
  const rawDate = cell("Date");
  const date = parseDate(rawDate);
  if (date === null) {
    return { code: "bad-date", line, value: rawDate };
  }
  const outflow = readAmount(cell("Outflow"), decimal, line, "Outflow");
  if (typeof outflow !== "number") {
    return outflow;
  }
  const inflow = readAmount(cell("Inflow"), decimal, line, "Inflow");
  if (typeof inflow !== "number") {
    return inflow;
  }
  return {
    line,
    date,
    payee: cell("Payee"),
    group: cell("Category Group"),
    category: cell("Category"),
    outflow,
    inflow,
  };
}
