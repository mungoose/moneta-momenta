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

/**
 * Highest purchase price the plan accepts, in cents (€1,000,000). Far above
 * any household instalment purchase; it keeps every total well inside the
 * safe-integer range, so a typo gets a field message instead of a crash.
 */
export const MAX_PRICE_CENTS = 100_000_000;

/** Fewest instalments: one payment isn't a plan. */
export const MIN_INSTALMENTS = 2;

/** Most instalments: five years, the usual upper end of hire-purchase terms. */
export const MAX_INSTALMENTS = 60;

/**
 * Highest annual interest rate, in basis points (100%). Real offers stay far
 * below it; the cap only stops a mistyped rate from producing absurd numbers.
 */
export const MAX_ANNUAL_RATE_BPS = 10_000;

/**
 * Highest monthly fee, in cents (€1,000). Real account fees are a few euros;
 * the cap stops a mistyped fee and keeps fee × count a safe integer.
 */
export const MAX_MONTHLY_FEE_CENTS = 100_000;

/**
 * Leftover below this share of average income, in basis points (10%), makes a
 * month "tight": the plan is paid, but one unexpected bill would break it.
 * A share of income rather than a fixed sum, so it scales with the household.
 */
export const BUFFER_BPS = 1_000;

/**
 * The first unfinished month for the sample data, so its last full month is
 * October 2026. Fixed rather than today's month, so the sample shows the same
 * result to a reviewer who opens it months later.
 */
export const SAMPLE_REFERENCE_MONTH = "2026-11";

/**
 * Instalment counts offered as one-tap choices: the common offers. Any other
 * count from {@link MIN_INSTALMENTS} to {@link MAX_INSTALMENTS} is typed in.
 */
export const INSTALMENT_PRESETS = [3, 6, 12] as const;
