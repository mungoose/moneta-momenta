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
  let line = 1;
  let i = 0;
  // Stryker disable next-line EqualityOperator: one more pass at the end only adds a blank record, which the caller skips
  while (i < text.length) {
    const recordLine = line;
    const fields: string[] = [];
    for (;;) {
      let value = "";
      if (text[i] === '"') {
        const openLine = line;
        i++;
        for (;;) {
          const close = text.indexOf('"', i);
          if (close === -1) return { malformedLine: openLine };
          const chunk = text.slice(i, close);
          value += chunk;
          line += chunk.split("\n").length - 1;
          i = close + 1;
          if (text[i] !== '"') break;
          value += '"';
          i++;
        }
        if (i < text.length && text[i] !== delimiter && text[i] !== "\n") return { malformedLine: line };
      } else {
        const start = i;
        // Stryker disable next-line EqualityOperator: stepping one past the end slices the same value
        while (i < text.length && text[i] !== delimiter && text[i] !== "\n") i++;
        value = text.slice(start, i);
      }
      fields.push(value);
      if (text[i] !== delimiter) break;
      i++;
    }
    i++; // past the newline (or past the end)
    line++;
    records.push({ line: recordLine, fields });
  }
  return records;
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
  if (!match) return null;
  // All three groups are mandatory in the pattern, so they're always set.
  const [, dd, mm, yyyy] = match as unknown as [string, string, string, string];
  const day = Number(dd);
  const month = Number(mm);
  // Day 0 of the next month is the last day of this one.
  const daysInMonth = new Date(Date.UTC(Number(yyyy), month, 0)).getUTCDate();
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth) return null;
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
    // Stryker disable next-line ConditionalExpression: parseAmount throws nothing else; a programming error must not be reported as a bad amount
    if (!(error instanceof InvalidAmountError)) throw error;
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
  // split() always returns at least one element, even for "".
  const headerLine = normalised.split("\n", 1)[0]!;
  const delimiter = headerLine.includes("\t") ? "\t" : ",";

  const read = readRecords(normalised, delimiter);
  if (!Array.isArray(read)) return fail({ code: "malformed", line: read.malformedLine });
  const records = read.filter((r) => r.fields.some((f) => f.trim() !== ""));
  const [header, ...data] = records;
  if (!header) return fail({ code: "empty" });

  const names = header.fields.map((f) => f.trim());
  const missing = REQUIRED_COLUMNS.filter((c) => !names.includes(c));
  if (missing.length > 0) return fail({ code: "missing-columns", missing });
  if (data.length === 0) return fail({ code: "empty" });

  let decimal: DecimalSeparator | undefined;
  const rows: Row[] = [];
  for (const record of data) {
    const { line } = record;
    if (record.fields.length !== names.length) return fail({ code: "malformed", line });
    // The field count matches the header, so every required column has a cell.
    const cell = (column: RequiredColumn) => record.fields[names.indexOf(column)]!.trim();

    const rawDate = cell("Date");
    const date = parseDate(rawDate);
    if (date === null) return fail({ code: "bad-date", line, value: rawDate });

    decimal ??= detectDecimal(cell("Outflow"));
    const outflow = readAmount(cell("Outflow"), decimal, line, "Outflow");
    if (typeof outflow !== "number") return fail(outflow);
    const inflow = readAmount(cell("Inflow"), decimal, line, "Inflow");
    if (typeof inflow !== "number") return fail(inflow);

    rows.push({
      line,
      date,
      payee: cell("Payee"),
      group: cell("Category Group"),
      category: cell("Category"),
      outflow,
      inflow,
    });
  }
  // `data` is non-empty, so the first row has set it.
  return { ok: true, rows, decimal: decimal! };
}
