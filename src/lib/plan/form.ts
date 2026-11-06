import { InvalidAmountError, parseAmount, toCents, type Cents, type DecimalSeparator } from "@/lib/money/cents";
import { buildSchedule, type PlanInput, type PlanInputError, type Schedule } from "./schedule";

/** The purchase form as typed: one text per field. */
export interface PlanForm {
  price: string;
  upfront: string;
  count: string;
  /** Percent per year, e.g. `9.9`. */
  rate: string;
  fee: string;
}

/**
 * Why one form field can't be used: the text can't be read (`invalid`), a
 * required field is empty (`required`), or a {@link PlanInputError} code.
 */
export interface PlanFormError {
  field: keyof PlanInput;
  code: PlanInputError["code"] | "invalid" | "required";
}

/** A checked form with its schedule, or every field to fix. */
export type PlanFormResult =
  { ok: true; input: PlanInput; schedule: Schedule } | { ok: false; errors: PlanFormError[] };

/** A trailing decimal part: one separator, then one or two digits. */
// Stryker disable next-line Regex: dropping `^` is equivalent; the leading `(.*)` already matches from the start
const DECIMAL_TAIL = /^(.*)([.,])(\d{1,2})$/;

/**
 * Reads a typed money amount. People type `1200`, `1200.5`, `1,200` or
 * `1.200,50` whatever the UI language, so the separator is read from the
 * text: a `.` or `,` followed by one or two digits at the end is the decimal
 * part; anything else is a thousands separator.
 * @param raw  The field text.
 * @returns    The amount in cents, or `null` when the text isn't an amount (including empty text).
 * @example parseMoneyInput("1.200,5") // 120050
 * @example parseMoneyInput("1,200")   // 120000
 * @example parseMoneyInput("-5")      // null
 */
export function parseMoneyInput(raw: string): Cents | null {
  const text = raw.trim().replace(/^€/, "").replace(/€$/, "").trim();
  // A "€" left inside (`€€5`, `12€00`) isn't an amount; parseAmount would quietly drop one more at the edge.
  if (text === "" || text.includes("€")) {
    return null;
  }
  // Stryker disable next-line ArrayDeclaration: any fallback without groups gives the same defaults
  const [, whole = text, separator, digits = ""] = DECIMAL_TAIL.exec(text) ?? [];
  const decimal = decimalOf(separator, whole);
  try {
    return parseAmount(`${whole || "0"}${decimal}${digits.padEnd(2, "0")}`, decimal);
  } catch (error) {
    // Stryker disable next-line ConditionalExpression,BlockStatement: parseAmount throws nothing else
    if (!(error instanceof InvalidAmountError)) {
      throw error;
    }
    return null;
  }
}

/** The decimal separator: the one before the decimal digits, else the one the whole part doesn't use. */
function decimalOf(separator: string | undefined, whole: string): DecimalSeparator {
  if (separator !== undefined) {
    return separator === "," ? "," : ".";
  }
  return whole.includes(".") ? "," : ".";
}

/**
 * Reads a typed annual interest rate in percent, with up to two decimals and an optional `%`.
 * @param raw  The field text, e.g. `9.9` or `9,9 %`.
 * @returns    The rate in basis points, or `null` when the text isn't a rate.
 * @example parseRateInput("9,9") // 990
 */
export function parseRateInput(raw: string): number | null {
  const match = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(raw.trim().replace(/\s*%$/, ""));
  if (!match) {
    return null;
  }
  return Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
}

/**
 * Reads a typed number of instalments: digits only.
 * @param raw  The field text.
 * @returns    The count, or `null` when the text isn't a whole number.
 * @example parseCountInput(" 18 ") // 18
 */
export function parseCountInput(raw: string): number | null {
  const text = raw.trim();
  return /^\d+$/.test(text) ? Number(text) : null;
}

/** Splits a non-negative integer into its hundreds and its last two digits, as text. */
function hundredths(value: number): [string, string] {
  const digits = String(value).padStart(3, "0");
  return [digits.slice(0, -2), digits.slice(-2)];
}

/**
 * Writes cents back as form and link text: plain digits, `.` for decimals,
 * and no decimals for whole euros.
 * @param value  A non-negative amount.
 * @returns      Text that {@link parseMoneyInput} reads back as `value`.
 * @example formatMoneyInput(120050) // "1200.50"
 * @example formatMoneyInput(120000) // "1200"
 */
export function formatMoneyInput(value: Cents): string {
  const [whole, cents] = hundredths(value);
  return cents === "00" ? whole : `${whole}.${cents}`;
}

/**
 * Writes basis points back as percent text, without trailing zeros.
 * @param bps  A non-negative rate in basis points.
 * @returns    Text that {@link parseRateInput} reads back as `bps`.
 * @example formatRateInput(990) // "9.9"
 */
export function formatRateInput(bps: number): string {
  const [whole, fraction] = hundredths(bps);
  const trimmed = fraction.replace(/0+$/, "");
  return trimmed === "" ? whole : `${whole}.${trimmed}`;
}

/**
 * Checks the typed form and works out the schedule. Unreadable or missing
 * text is reported first, per field in form order; once every field reads,
 * the range checks of `buildSchedule` apply. Empty upfront, rate and fee
 * mean 0, as their hints say.
 * @param form  The form text.
 * @returns     The plan input and schedule, or the errors to show next to each field.
 * @example checkPlanForm({ price: "1200", upfront: "", count: "12", rate: "", fee: "" })
 *          // ok; twelve instalments of 10000 (€100)
 */
export function checkPlanForm(form: PlanForm): PlanFormResult {
  const errors: PlanFormError[] = [];
  const zero = toCents(0);
  const price = readField(errors, "price", form.price, parseMoneyInput);
  const upfront = readField(errors, "upfront", form.upfront, parseMoneyInput, zero);
  const count = readField(errors, "count", form.count, parseCountInput);
  const annualRateBps = readField(errors, "annualRateBps", form.rate, parseRateInput, 0);
  const monthlyFee = readField(errors, "monthlyFee", form.fee, parseMoneyInput, zero);
  if (
    price === undefined ||
    upfront === undefined ||
    count === undefined ||
    annualRateBps === undefined ||
    monthlyFee === undefined
  ) {
    return { ok: false, errors };
  }
  const input: PlanInput = { price, upfront, count, annualRateBps, monthlyFee };
  const result = buildSchedule(input);
  return result.ok ? { ok: true, input, schedule: result.schedule } : result;
}

/**
 * Reads one field, adding an error to `errors` when it can't be used.
 * Empty text gives `empty`, or a `required` error when there is no default.
 * Returns `undefined` exactly when it added an error.
 */
function readField<T>(
  errors: PlanFormError[],
  field: keyof PlanInput,
  text: string,
  parse: (raw: string) => T | null,
  empty?: T,
): T | undefined {
  if (text.trim() === "") {
    if (empty === undefined) {
      errors.push({ field, code: "required" });
    }
    return empty;
  }
  const value = parse(text);
  if (value === null) {
    errors.push({ field, code: "invalid" });
    return undefined;
  }
  return value;
}
