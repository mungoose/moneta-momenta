import {
  MAX_ANNUAL_RATE_BPS,
  MAX_INSTALMENTS,
  MAX_MONTHLY_FEE_CENTS,
  MAX_PRICE_CENTS,
  MIN_INSTALMENTS,
} from "@/lib/constants";
import { divRound, sum, toCents, type Cents } from "@/lib/money/cents";

/** The purchase form's values. */
export interface PlanInput {
  price: Cents;
  /** Paid at purchase, so it isn't spread over the instalments. */
  upfront: Cents;
  /** Number of monthly instalments. */
  count: number;
  /** Annual interest rate in basis points: 990 is 9.9%. */
  annualRateBps: number;
  /** A fixed fee added to every instalment. */
  monthlyFee: Cents;
}

/** Why one form field can't be used. The UI shows it next to that field. */
export interface PlanInputError {
  field: keyof PlanInput;
  /** `not-whole`: not a whole number (of cents, months or basis points). */
  code: "not-whole" | "too-low" | "too-high";
}

/** What the plan costs and what is due each month. */
export interface Schedule {
  /** `price − upfront`: the amount spread over the instalments. */
  financed: Cents;
  interest: Cents;
  /** `monthlyFee × count`. */
  fees: Cents;
  /** `financed + interest + fees`; the instalments add up to exactly this. */
  total: Cents;
  /** One amount per month, all equal except the last, which also carries the remainder. */
  instalments: Cents[];
}

/** A schedule, or every field that stops one. */
export type ScheduleResult = { ok: true; schedule: Schedule } | { ok: false; errors: PlanInputError[] };

/**
 * Checks the form values and works out the monthly instalments.
 * Valid values: `0 < price ≤` {@link MAX_PRICE_CENTS}, `0 ≤ upfront < price`,
 * {@link MIN_INSTALMENTS} `≤ count ≤` {@link MAX_INSTALMENTS}, a rate from 0 to
 * {@link MAX_ANNUAL_RATE_BPS} and a fee from 0 to {@link MAX_MONTHLY_FEE_CENTS},
 * all whole numbers. Within these bounds every amount stays a safe integer.
 * @param input  The purchase form's values.
 * @returns      The schedule, or one error per invalid field, in form order.
 * @example buildSchedule({ price: 120000, upfront: 0, count: 12, annualRateBps: 0, monthlyFee: 0 })
 *          // ok; twelve instalments of 10000 (€100)
 */
export function buildSchedule(input: PlanInput): ScheduleResult {
  const errors = validate(input);
  if (errors.length > 0) {
    return { ok: false, errors };
  }
  const financed = toCents(input.price - input.upfront);
  const interest = annuityInterest(financed, input.annualRateBps, input.count);
  const fees = toCents(input.monthlyFee * input.count);
  const total = sum([financed, interest, fees]);
  return { ok: true, schedule: { financed, interest, fees, total, instalments: split(total, input.count) } };
}

/**
 * Total interest of a fixed-repayment (annuity) loan, the usual way
 * hire-purchase is quoted: the monthly repayment
 * `financed × r / (1 − (1 + r)^−count)`, with `r` the annual rate ÷ 12, is
 * rounded to cents, and the interest is what `count` such repayments add on
 * top of `financed`. That keeps the repayment the user sees equal to the
 * one an offer quotes. This is the only float maths in the plan, and its
 * result is rounded once, here.
 * @param financed       Amount spread over the plan.
 * @param annualRateBps  Annual rate in basis points, 0 or more.
 * @param count          Number of monthly repayments.
 * @returns              The interest; 0 for a 0% rate, and never negative,
 *                       even when the repayment rounds down.
 * @throws {RangeError} When the result isn't a safe integer (inputs outside {@link buildSchedule}'s bounds).
 * @example annuityInterest(160000, 990, 12) // 8708: 12 × €140.59 − €1,600
 */
export function annuityInterest(financed: Cents, annualRateBps: number, count: number): Cents {
  if (annualRateBps === 0) {
    return toCents(0);
  }
  // Rates are ratios, not cents; the float result is rounded to cents below.
  // eslint-disable-next-line no-restricted-syntax
  const monthlyRate = annualRateBps / 10_000 / 12;
  // eslint-disable-next-line no-restricted-syntax
  const repayment = (financed * monthlyRate) / (1 - (1 + monthlyRate) ** -count);
  // The one rounding of a float to cents. `repayment` is positive, so half up is half away from zero.
  // eslint-disable-next-line no-restricted-syntax
  const rounded = Math.round(repayment);
  return toCents(Math.max(0, rounded * count - financed));
}

/** One error per field, in form order. */
function validate(input: PlanInput): PlanInputError[] {
  const priceError = check("price", input.price, 1, MAX_PRICE_CENTS);
  // Upfront is compared with the price only once the price is valid, so a
  // wrong price gets one message, not a second one on the upfront field.
  const maxUpfront = priceError === undefined ? input.price - 1 : Number.POSITIVE_INFINITY;
  const errors = [
    priceError,
    check("upfront", input.upfront, 0, maxUpfront),
    check("count", input.count, MIN_INSTALMENTS, MAX_INSTALMENTS),
    check("annualRateBps", input.annualRateBps, 0, MAX_ANNUAL_RATE_BPS),
    check("monthlyFee", input.monthlyFee, 0, MAX_MONTHLY_FEE_CENTS),
  ];
  return errors.filter((error) => error !== undefined);
}

/** Checks that a field is a whole number within `[min, max]`. */
function check(field: keyof PlanInput, value: number, min: number, max: number): PlanInputError | undefined {
  if (!Number.isSafeInteger(value)) {
    return { field, code: "not-whole" };
  }
  if (value < min) {
    return { field, code: "too-low" };
  }
  if (value > max) {
    return { field, code: "too-high" };
  }
  return undefined;
}

/** Splits `total` into `count` equal instalments, rounded down, with the remainder on the last. */
function split(total: Cents, count: number): Cents[] {
  const remainder = total % count;
  // `total − remainder` is a multiple of `count`, so this is exact floor division.
  const base = toCents(divRound(total - remainder, count));
  const instalments = Array<Cents>(count).fill(base);
  instalments[count - 1] = toCents(base + remainder);
  return instalments;
}
