/**
 * Largest file the import will read, in bytes. A year of a household's
 * transactions is about 65 KB, so 5 MB covers decades of real exports, while
 * a wrongly picked photo or video is refused before the browser decodes it.
 */
export const MAX_FILE_BYTES = 5 * 1024 * 1024;

/**
 * Fewest full months the averages are computed from. With fewer, one odd
 * month (a holiday, a car repair) would set the whole average.
 */
export const MIN_FULL_MONTHS = 3;

/**
 * The file's first month counts as full only if its first transaction is on
 * or before this day. An export's date range often starts mid-month, and the
 * file has no month markers, so this is a date-only heuristic: most
 * households have several transactions in any given week, so a first row
 * after day 7 almost always means the month's start is missing.
 */
export const FIRST_MONTH_MAX_START_DAY = 7;

/**
 * Period lengths the user can pick, in full months, counted back from the
 * last full month. A quarter, half a year, a year: long enough to smooth one
 * odd month, short enough to reflect the current situation.
 */
export const PERIOD_OPTIONS = [3, 6, 12] as const;

/**
 * Period length used until the user picks one, when the data has that many
 * full months. Half a year smooths one-off months while still reflecting
 * recent income.
 */
export const DEFAULT_PERIOD_MONTHS = 6;
