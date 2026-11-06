/**
 * A money amount in integer euro cents. The brand stops a plain `number`
 * (a count, a float, euros) from being passed where cents are expected.
 * Create one with {@link toCents} or {@link parseAmount}.
 */
export type Cents = number & { readonly __brand: "Cents" };

/** The decimal separator a file uses for every amount, detected once per file. */
export type DecimalSeparator = "," | ".";

/**
 * Thrown when a text value isn't an amount in the accepted format.
 * The message is deliberately generic: the value is a user's transaction
 * amount, so it is kept only on {@link InvalidAmountError.raw} for the
 * line-numbered UI message and never ends up in a log line via `message`.
 */
export class InvalidAmountError extends Error {
  /** The rejected text, exactly as it appeared in the file. */
  readonly raw: string;

  /** @param raw  The rejected text. */
  constructor(raw: string) {
    super("Not a valid amount");
    this.name = "InvalidAmountError";
    this.raw = raw;
  }
}

/**
 * Brands an integer as cents, checking that it is a safe integer, so no
 * precision is lost anywhere downstream.
 * @param value  An integer number of cents.
 * @returns      The same value, typed as {@link Cents}.
 * @throws {RangeError} When `value` isn't a safe integer (fractions, NaN, ±Infinity, beyond ±2^53−1).
 * @example toCents(246587) // 246587, i.e. €2,465.87
 */
export function toCents(value: number): Cents {
  if (!Number.isSafeInteger(value)) {
    // Stryker disable next-line StringLiteral: diagnostic text only; tests assert the error type
    throw new RangeError(`Not a safe integer number of cents: ${value}`);
  }
  return value as Cents;
}

/**
 * Integer division rounding half away from zero: the only way the core
 * divides. It works from the remainder rather than `Math.round(a / b)`,
 * because the float quotient is already rounded for large values
 * (`MAX_SAFE_INTEGER / 3` comes out as …330.5) and `Math.round` rounds
 * −3.5 to −3.
 * @param a  Dividend, a safe integer (usually cents).
 * @param b  Divisor, a non-zero safe integer.
 * @returns  The rounded quotient, never `-0`.
 * @throws {RangeError} When an operand isn't a safe integer, or `b` is 0.
 * @example divRound(7, 2)   // 4
 * @example divRound(-7, 2)  // -4
 * @example divRound(253713 * 1000, 10000) // 25371: 10% of €2,537.13
 */
export function divRound(a: number, b: number): number {
  // Stryker disable StringLiteral: diagnostic text only; tests assert the error type
  if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b)) {
    throw new RangeError(`divRound needs safe integers, got ${a} / ${b}`);
  }
  if (b === 0) {
    throw new RangeError("divRound: division by zero");
  }
  // Stryker restore StringLiteral
  const remainder = a % b; // exact, and has the sign of `a`
  // `a - remainder` is a multiple of `b`, so this division is exact.
  const quotient = (a - remainder) / b;
  // 2·|remainder| < 2^54 and is even, so it is exactly representable.
  if (2 * Math.abs(remainder) >= Math.abs(b)) {
    // A non-zero remainder means a ≠ 0, and b ≠ 0 was checked above, so `< 0` and `<= 0` agree here.
    // Stryker disable next-line EqualityOperator: equivalent mutants (see above)
    return quotient + (a < 0 === b < 0 ? 1 : -1);
  }
  return quotient + 0; // turns -0 (e.g. -1 / -3) into 0
}

/**
 * Adds amounts exactly.
 * @param values  Amounts in cents.
 * @returns       The total; 0 for an empty list.
 * @throws {RangeError} When a running total leaves the safe-integer range.
 * @example sum([toCents(100), toCents(-50)]) // 50
 */
export function sum(values: readonly Cents[]): Cents {
  let total = 0;
  for (const value of values) {
    // Any sum past ±(2^53−1) rounds to a value that is no longer a safe integer.
    total = toCents(total + value);
  }
  return total as Cents;
}

/** Space, no-break space and narrow no-break space: all used as thousands separators. */
const SPACES = "   ";

/**
 * Whole-value patterns per decimal separator. The integer part is either
 * plain digits or groups of three joined by one consistent thousands
 * separator (`\1`), so `1 234.567,00` and `24.65,87` are rejected rather
 * than misread. Exactly two decimals. `\d` is ASCII-only without the `u` flag.
 */
const AMOUNT_PATTERN: Record<DecimalSeparator, RegExp> = {
  ",": new RegExp(`^(?:\\d+|\\d{1,3}([${SPACES}.])\\d{3}(?:\\1\\d{3})*),(\\d{2})$`),
  ".": new RegExp(`^(?:\\d+|\\d{1,3}([${SPACES},])\\d{3}(?:\\1\\d{3})*)\\.(\\d{2})$`),
};

/**
 * Parses a non-negative amount with exactly two decimals into cents.
 * Accepts thousands separators (space, no-break space, narrow no-break
 * space, or the non-decimal punctuation mark) and one optional `€` before
 * or after the number. Signs are rejected: the file's Outflow and Inflow
 * columns are never negative.
 * @param raw      The field text from the file.
 * @param decimal  The file's decimal separator; a value using the other one is rejected.
 * @returns        The amount in cents.
 * @throws {InvalidAmountError} When `raw` doesn't match the format or exceeds the safe-integer range.
 * @example parseAmount("2 465,87 €", ",") // 246587
 * @example parseAmount("€2,465.87", ".")  // 246587
 * @example parseAmount("12,3", ",")       // throws InvalidAmountError
 */
export function parseAmount(raw: string, decimal: DecimalSeparator): Cents {
  let text = raw.trim();
  if (text.startsWith("€")) {
    text = text.slice(1).trimStart();
  } else if (text.endsWith("€")) {
    text = text.slice(0, -1).trimEnd();
  }
  if (!AMOUNT_PATTERN[decimal].test(text)) {
    throw new InvalidAmountError(raw);
  }
  const value = Number(text.replace(/\D/g, ""));
  if (!Number.isSafeInteger(value)) {
    throw new InvalidAmountError(raw);
  }
  return value as Cents;
}
