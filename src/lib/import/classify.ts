import type { Cents } from "@/lib/money/cents";
import { CARD_PAYMENT_GROUP, INCOME_GROUP, OPENING_BALANCE_PAYEE, TRANSFER_PAYEE_PREFIX } from "./format-spec";
import type { Row } from "./types";

/** Why a row doesn't count as income or spending. */
export type ExcludedReason = "transfer" | "opening-balance" | "card-payment" | "uncategorised";

/** What a row counts as in the budget. */
export type Classified =
  | { kind: "income"; row: Row; amount: Cents }
  | { kind: "spending"; row: Row; group: string; category: string; net: Cents }
  | { kind: "excluded"; row: Row; reason: ExcludedReason };

const sameText = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/**
 * Decides whether a row is income, spending or excluded, and by how much.
 * Checks run in a fixed order, so a row matching several rules gets the first:
 * 1. Transfer between the user's own budget accounts (transfer payee, no category).
 *    A transfer that *has* a category moves money out of the budget, e.g. to a
 *    loan or investment account. It's real spending, so it falls through to 6.
 * 2. Opening balance: money the user already had, even when filed as income.
 * 3. Credit-card payoff: the purchases were counted when they were made.
 * 4. Income group: income of `inflow − outflow`.
 * 5. No category group: tracking or off-budget rows.
 * 6. Anything else: spending of `outflow − inflow`, so a refund lowers its category.
 * @param row  A parsed row.
 * @returns    The row's classification.
 * @example classify(salaryRow) // { kind: "income", row, amount: 246587 }
 */
export function classify(row: Row): Classified {
  if (row.payee.startsWith(TRANSFER_PAYEE_PREFIX) && row.group === "") {
    return { kind: "excluded", row, reason: "transfer" };
  }
  if (row.payee === OPENING_BALANCE_PAYEE) {
    return { kind: "excluded", row, reason: "opening-balance" };
  }
  if (sameText(row.group, CARD_PAYMENT_GROUP)) {
    return { kind: "excluded", row, reason: "card-payment" };
  }
  // Both amounts are non-negative safe integers, so their difference is too.
  if (sameText(row.group, INCOME_GROUP)) {
    return { kind: "income", row, amount: (row.inflow - row.outflow) as Cents };
  }
  if (row.group === "") {
    return { kind: "excluded", row, reason: "uncategorised" };
  }
  return { kind: "spending", row, group: row.group, category: row.category, net: (row.outflow - row.inflow) as Cents };
}
