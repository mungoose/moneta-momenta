import { addMonths, type YearMonth } from "@/lib/budget/months";
import { summarise, type BudgetError } from "@/lib/budget/summary";
import { parseTransactions } from "@/lib/import/parse";
import { readFile } from "@/lib/import/read-file";
import type { ImportError, ParsedFile } from "@/lib/import/types";

/** A file that passed every check, ready for the summary and the plan. */
export interface LoadedData {
  file: ParsedFile;
  /** The first unfinished month the summary and plan count from. */
  reference: YearMonth;
  /** Full months in the file, which decides the period lengths on offer. */
  fullMonthCount: number;
}

/** Why a file can't be used: it can't be read, or it can't be summarised. The codes don't overlap. */
export type LoadError = ImportError | BudgetError;

/** Loaded data, or the first problem found. */
export type LoadResult = { ok: true; data: LoadedData } | { ok: false; error: LoadError };

/**
 * Parses file text and checks that it can be summarised. The sample and
 * uploads both go through here, so the sample proves the upload path.
 * The check uses the default period, the one the summary opens on: a file
 * whose recent months have no income is refused here rather than shown as
 * a summary that can't be computed.
 * @param text       The whole file as text.
 * @param reference  The first unfinished month.
 * @returns          The data, or the parser's or the summary's error.
 * @throws {RangeError} When a total leaves the safe-integer range (see `summarise`).
 * @example loadText(sampleText, "2026-11") // { ok: true, data: { file, reference: "2026-11", fullMonthCount: 12 } }
 */
export function loadText(text: string, reference: YearMonth): LoadResult {
  const file = parseTransactions(text);
  if (!file.ok) {
    return file;
  }
  const summary = summarise(file, reference);
  if (!summary.ok) {
    return summary;
  }
  return { ok: true, data: { file, reference, fullMonthCount: summary.summary.fullMonths.length } };
}

/**
 * Reads a user-picked file and loads it with {@link loadText}.
 * @param file       The picked file.
 * @param reference  The first unfinished month: today's, for an upload.
 * @returns          The data, or why the file can't be used.
 * @throws {RangeError} As {@link loadText}.
 */
export async function loadFile(file: Blob, reference: YearMonth): Promise<LoadResult> {
  const read = await readFile(file);
  return read.ok ? loadText(read.text, reference) : read;
}

/**
 * The file's last full month, when it's earlier than the month before
 * `reference`. Whole recent months are then missing from the file, which no
 * edge-month check can see, so the averages may describe an older situation.
 * @param lastMonth  The file's last full month.
 * @param reference  The first unfinished month.
 * @returns          `lastMonth` when it's out of date, otherwise `null`.
 * @example outdatedEnd("2026-09", "2026-11") // "2026-09"
 * @example outdatedEnd("2026-10", "2026-11") // null
 */
export function outdatedEnd(lastMonth: YearMonth, reference: YearMonth): YearMonth | null {
  return lastMonth < addMonths(reference, -1) ? lastMonth : null;
}
