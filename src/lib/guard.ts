/** A calculation's result, or `ok: false` when an amount left the safe-integer range. */
export type Guarded<T> = { ok: true; value: T } | { ok: false };

/**
 * Runs a calculation that throws a `RangeError` when a total can't be
 * counted exactly (see `toCents`), and returns that case as a value, so the
 * UI can show it instead of crashing. The summary and the plan run while
 * the page renders: a period or plan change can push a total that loaded
 * fine past 2^53 − 1 cents. Any other error is a bug and is rethrown.
 * @param run  The calculation.
 * @returns    Its result, or `{ ok: false }` on a `RangeError`.
 * @throws     Whatever `run` throws, unless it's a `RangeError`.
 * @example guardRange(() => summarise(file, "2026-11", 12)) // { ok: false } when the 12 months add up past 2^53 − 1 cents
 */
export function guardRange<T>(run: () => T): Guarded<T> {
  try {
    return { ok: true, value: run() };
  } catch (error) {
    if (error instanceof RangeError) {
      return { ok: false };
    }
    throw error;
  }
}
