import { DEFAULT_PERIOD_MONTHS, PERIOD_OPTIONS } from "@/lib/constants";
import { formatMoneyInput, formatRateInput, type PlanForm } from "@/lib/plan/form";
import type { PlanInput } from "@/lib/plan/schedule";

/** The sample households: one with room to spare, one that barely breaks even. */
export const SAMPLE_PROFILES = ["comfortable", "tight"] as const;

/** One of {@link SAMPLE_PROFILES}. */
export type SampleProfile = (typeof SAMPLE_PROFILES)[number];

/**
 * What a sample-data link opens. Only sample data is ever put in a link:
 * an uploaded file's figures stay in the page.
 */
export interface SampleLink {
  profile: SampleProfile;
  /** One of {@link PERIOD_OPTIONS}; `undefined` means the default. */
  period: number | undefined;
  /** The purchase form text, unchecked, when the link carries a plan. */
  plan: PlanForm | undefined;
}

/**
 * Reads a sample link from a page's query, e.g. `?sample=comfortable&price=1200&n=12`.
 * Anything a reader could have edited is treated as untrusted: an unknown
 * profile gives no link, an unknown period is dropped, and plan values are
 * passed on as form text for the form's own checks.
 * @param params  The page's query parameters.
 * @returns       The link, or `null` when it names no known sample.
 * @example readSampleLink(new URLSearchParams("sample=tight&period=12"))
 *          // { profile: "tight", period: 12, plan: undefined }
 */
export function readSampleLink(params: URLSearchParams): SampleLink | null {
  const profile = SAMPLE_PROFILES.find((p) => p === params.get("sample"));
  if (profile === undefined) {
    return null;
  }
  const period = PERIOD_OPTIONS.find((p) => String(p) === params.get("period"));
  const price = params.get("price");
  const count = params.get("n");
  const plan =
    price === null && count === null
      ? undefined
      : {
          price: price ?? "",
          upfront: params.get("upfront") ?? "0",
          count: count ?? "",
          rate: params.get("rate") ?? "0",
          fee: params.get("fee") ?? "0",
        };
  return { profile, period, plan };
}

/**
 * Writes the query for a sample link, leaving out defaults so links stay short.
 * @param link  The profile, the period in use and, on the result step, the checked plan.
 * @returns     The query, starting with `?`.
 * @example writeSampleLink({ profile: "comfortable", period: 6, plan: { price: 120000, upfront: 0, count: 12, annualRateBps: 0, monthlyFee: 0 } })
 *          // "?sample=comfortable&price=1200&n=12"
 */
export function writeSampleLink(link: { profile: SampleProfile; period: number; plan?: PlanInput }): string {
  const params = new URLSearchParams({ sample: link.profile });
  if (link.period !== DEFAULT_PERIOD_MONTHS) {
    params.set("period", String(link.period));
  }
  const { plan } = link;
  if (plan) {
    params.set("price", formatMoneyInput(plan.price));
    if (plan.upfront > 0) {
      params.set("upfront", formatMoneyInput(plan.upfront));
    }
    params.set("n", String(plan.count));
    if (plan.annualRateBps > 0) {
      params.set("rate", formatRateInput(plan.annualRateBps));
    }
    if (plan.monthlyFee > 0) {
      params.set("fee", formatMoneyInput(plan.monthlyFee));
    }
  }
  return `?${params.toString()}`;
}
