/**
 * The transaction file format the app accepts. The parser, the
 * missing-columns error and the format help all read from here, so they
 * can't drift apart. No product is named: any export with these columns works.
 */

/** Columns a file must have, matched by exact header name in any order. Other columns are ignored. */
export const REQUIRED_COLUMNS = ["Date", "Payee", "Category Group", "Category", "Outflow", "Inflow"] as const;

/** One of {@link REQUIRED_COLUMNS}. */
export type RequiredColumn = (typeof REQUIRED_COLUMNS)[number];

/** Category group that marks income (compared case-insensitively). */
export const INCOME_GROUP = "Inflow";

/** Category group of credit-card payoffs (compared case-insensitively). The purchases were already counted when made. */
export const CARD_PAYMENT_GROUP = "Credit Card Payments";

/** Payee prefix of a move between the user's own accounts (exact). */
export const TRANSFER_PAYEE_PREFIX = "Transfer : ";

/** Payee of an account's opening balance (exact). It's money the user already had, not income. */
export const OPENING_BALANCE_PAYEE = "Starting Balance";
