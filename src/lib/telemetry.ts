import { INSTALMENT_PRESETS, type PERIOD_OPTIONS } from "@/lib/constants";
import type { LoadError } from "@/lib/load";
import type { Cents } from "@/lib/money/cents";
import type { Status } from "@/lib/plan/affordability";
import type { PlanInput } from "@/lib/plan/schedule";

/** Purchase price in four coarse ranges, so no event carries an amount. */
export type PriceBucket = "<300" | "300–1000" | "1000–3000" | ">3000";

/** An instalment preset, or `custom` for any other count. */
export type InstalmentBucket = `${(typeof INSTALMENT_PRESETS)[number]}` | "custom";

/** Why an upload can't be used: the error's code, or `unreadable` when no check describes it. */
export type ImportFailureReason = LoadError["code"] | "unreadable";

/**
 * The only events telemetry can send (TECH-PLAN §8). Every property is an
 * enum or a coarse bucket: never an amount, category, payee, date or file name.
 */
export type TelemetryEvent =
  | { name: "flow_started"; source: "sample" | "upload" }
  | { name: "import_failed"; reason: ImportFailureReason }
  | { name: "period_changed"; months: (typeof PERIOD_OPTIONS)[number] }
  | {
      name: "plan_checked";
      verdict: Status;
      instalments: InstalmentBucket;
      priceBucket: PriceBucket;
      hasInterest: boolean;
    }
  /** The user opened "How we calculated this" on a result. */
  | { name: "explanation_opened" };

/** The event named `N`. */
export type EventNamed<N extends TelemetryEvent["name"]> = Extract<TelemetryEvent, { name: N }>;

/** What leaves the page: an event plus the page load's random session ID, so a funnel can be counted. */
export type TelemetryPayload = TelemetryEvent & { session: string };

/** The properties of the event named `N`, besides its name. */
type Fields<N extends TelemetryEvent["name"]> = Exclude<keyof EventNamed<N>, "name">;

/**
 * The whitelist, as data. TypeScript only rejects an unknown property on a
 * fresh object literal; an object built elsewhere or spread in passes the
 * type check with extra properties, so the payload is rebuilt from this list.
 */
const FIELDS: { [N in TelemetryEvent["name"]]: readonly Fields<N>[] } = {
  flow_started: ["source"],
  import_failed: ["reason"],
  period_changed: ["months"],
  plan_checked: ["verdict", "instalments", "priceBucket", "hasInterest"],
  // Stryker disable next-line ArrayDeclaration: equivalent; whitelisting a made-up key changes nothing, as no event carries it
  explanation_opened: [],
};

/** The event with only its name and whitelisted properties. */
function whitelisted(event: TelemetryEvent): TelemetryEvent {
  const fields: readonly string[] = FIELDS[event.name];
  // Safe: the entries are the event's own name and properties, a subset of the same event.
  return Object.fromEntries(
    Object.entries(event).filter(([key]) => key === "name" || fields.includes(key)),
  ) as TelemetryEvent;
}

/**
 * Makes a tracker that sends whitelisted events to `sink`.
 * @param sink        Where payloads go.
 * @param newSession  Makes the session ID. Called on the first event, not
 *                    before: a random value made while the module loads would
 *                    be made during the static prerender too.
 * @returns           A function that sends one event.
 * @example createTracker((p) => sent.push(p), () => "s1")({ name: "flow_started", source: "sample" })
 *          // sent: [{ name: "flow_started", source: "sample", session: "s1" }]
 */
export function createTracker(
  sink: (payload: TelemetryPayload) => void,
  newSession: () => string,
): (event: TelemetryEvent) => void {
  let session: string | null = null;
  return (event) => {
    session ??= newSession();
    sink({ ...whitelisted(event), session });
  };
}

/**
 * 128 random bits as hex. `crypto.getRandomValues` rather than `randomUUID`,
 * which exists only in secure contexts: the dev server opened over a LAN
 * address on a phone would throw on every tracked click.
 */
function randomSession(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Logs a payload: the demo's sink. */
function logSink(payload: TelemetryPayload): void {
  // In production, point this at a collector endpoint, e.g. a small API route
  // shipping to Loki/Grafana or a product-analytics tool. The CSP `connect-src`
  // would then allow that one origin.
  // eslint-disable-next-line no-console -- the one console call: payloads hold only whitelisted fields
  console.info("[telemetry]", payload);
}

/**
 * Sends one event, with this page load's session ID.
 * @example track({ name: "period_changed", months: 12 })
 */
export const track = createTracker(logSink, randomSession);

/**
 * The coarse range a purchase price falls in.
 * @param price  The full price, in cents.
 * @returns      Under €300, €300 up to €999.99, €1,000 to €3,000, or over €3,000.
 * @example priceBucket(120000) // "1000–3000"
 */
export function priceBucket(price: Cents): PriceBucket {
  if (price < 30000) {
    return "<300";
  }
  if (price < 100000) {
    return "300–1000";
  }
  return price <= 300000 ? "1000–3000" : ">3000";
}

/**
 * How an instalment count is recorded: a preset as itself (even when typed
 * under "Custom"), any other count as `custom`.
 * @param count  Number of instalments.
 * @returns      `"3"`, `"6"`, `"12"` or `"custom"`.
 * @example instalmentBucket(12) // "12"
 * @example instalmentBucket(5)  // "custom"
 */
export function instalmentBucket(count: number): InstalmentBucket {
  const preset = INSTALMENT_PRESETS.find((p) => p === count);
  return preset === undefined ? "custom" : `${preset}`;
}

/**
 * The event for an upload that can't be used. Only the code goes in: a
 * missing column list, line number or cell value never does.
 * @param error  Why it failed, or `null` when reading failed in a way no check describes.
 * @returns      An `import_failed` event.
 * @example importFailed({ code: "bad-date", line: 3, value: "31/02/2026" }) // { name: "import_failed", reason: "bad-date" }
 */
export function importFailed(error: LoadError | null): EventNamed<"import_failed"> {
  return { name: "import_failed", reason: error?.code ?? "unreadable" };
}

/**
 * The event for a plan the user checked.
 * @param input    The checked plan.
 * @param verdict  Its overall verdict.
 * @returns        A `plan_checked` event with the plan in buckets. A monthly
 *                 fee isn't interest, so only the rate sets `hasInterest`.
 * @example planChecked({ price: 120000, upfront: 0, count: 12, annualRateBps: 0, monthlyFee: 0 }, "fits")
 *          // { name: "plan_checked", verdict: "fits", instalments: "12", priceBucket: "1000–3000", hasInterest: false }
 */
export function planChecked(input: PlanInput, verdict: Status): EventNamed<"plan_checked"> {
  return {
    name: "plan_checked",
    verdict,
    instalments: instalmentBucket(input.count),
    priceBucket: priceBucket(input.price),
    hasInterest: input.annualRateBps > 0,
  };
}
