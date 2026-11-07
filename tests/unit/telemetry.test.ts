import { afterEach, describe, expect, it, vi } from "vitest";
import type { Cents } from "@/lib/money/cents";
import type { PlanInput } from "@/lib/plan/schedule";
import {
  createTracker,
  importFailed,
  instalmentBucket,
  planChecked,
  priceBucket,
  track,
  type TelemetryEvent,
  type TelemetryPayload,
} from "@/lib/telemetry";

const cents = (value: number) => value as Cents;

/** A tracker that records into an array, with a fixed session ID. */
function recorder() {
  const sent: TelemetryPayload[] = [];
  const newSession = vi.fn(() => "session-1");
  const send = createTracker((payload) => sent.push(payload), newSession);
  return { sent, send, newSession };
}

const plan = (overrides: Partial<PlanInput> = {}): PlanInput => ({
  price: cents(120000),
  upfront: cents(0),
  count: 12,
  annualRateBps: 0,
  monthlyFee: cents(0),
  ...overrides,
});

/** One of each event, every field set. */
const EVERY_EVENT: TelemetryEvent[] = [
  { name: "flow_started", source: "sample" },
  { name: "import_failed", reason: "missing-columns" },
  { name: "period_changed", months: 12 },
  { name: "plan_checked", verdict: "tight", instalments: "custom", priceBucket: "1000–3000", hasInterest: true },
  { name: "explanation_opened" },
];

/** The fields each event may carry besides `name` and `session` (TECH-PLAN §8). */
const WHITELIST: Record<TelemetryEvent["name"], string[]> = {
  flow_started: ["source"],
  import_failed: ["reason"],
  period_changed: ["months"],
  plan_checked: ["verdict", "instalments", "priceBucket", "hasInterest"],
  explanation_opened: [],
};

describe("createTracker", () => {
  it("sends each event with the page load's session ID", () => {
    const { sent, send } = recorder();
    send({ name: "flow_started", source: "upload" });
    send({ name: "period_changed", months: 3 });
    expect(sent).toEqual([
      { name: "flow_started", source: "upload", session: "session-1" },
      { name: "period_changed", months: 3, session: "session-1" },
    ]);
  });

  it("makes the session ID on the first event, once", () => {
    const { send, newSession } = recorder();
    expect(newSession).not.toHaveBeenCalled();
    send({ name: "flow_started", source: "sample" });
    send({ name: "flow_started", source: "sample" });
    expect(newSession).toHaveBeenCalledTimes(1);
  });

  it("gives each tracker its own session", () => {
    const sessions = ["a", "b"];
    const sent: TelemetryPayload[] = [];
    const newSession = () => sessions.shift() ?? "none";
    createTracker((p) => sent.push(p), newSession)({ name: "flow_started", source: "sample" });
    createTracker((p) => sent.push(p), newSession)({ name: "flow_started", source: "sample" });
    expect(sent.map((p) => p.session)).toEqual(["a", "b"]);
  });

  it.each(EVERY_EVENT)("sends exactly the whitelisted fields of $name", (event) => {
    const { sent, send } = recorder();
    send(event);
    expect(sent).toEqual([{ ...event, session: "session-1" }]);
    expect(Object.keys(sent[0] ?? {}).sort()).toEqual(["name", "session", ...WHITELIST[event.name]].sort());
  });

  it("drops a field the event doesn't define, even one the compiler lets through", () => {
    // Not a fresh object literal, so TypeScript's excess-property check doesn't see `price`.
    const withExtra = { name: "flow_started", source: "upload", price: 120000, payee: "Shop" } as const;
    const { sent, send } = recorder();
    send(withExtra);
    expect(sent).toEqual([{ name: "flow_started", source: "upload", session: "session-1" }]);
  });

  it("doesn't let a call site pass free values or other events", () => {
    // Never called: each line is a compile error, and `tsc` fails if one stops being one.
    function rejected(send: (event: TelemetryEvent) => void) {
      // @ts-expect-error: no amount field on any event
      send({ name: "flow_started", source: "sample", amount: 120000 });
      // @ts-expect-error: `source` is an enum, not free text
      send({ name: "flow_started", source: "bank.csv" });
      // @ts-expect-error: the period is one of the offered lengths
      send({ name: "period_changed", months: 7 });
      // @ts-expect-error: the price goes in as a bucket, never in cents
      send({ name: "plan_checked", verdict: "fits", instalments: "12", priceBucket: 120000, hasInterest: false });
      // @ts-expect-error: opening the explanation carries nothing about the plan
      send({ name: "explanation_opened", verdict: "fits" });
      // @ts-expect-error: only the defined events exist
      send({ name: "page_viewed" });
    }
    expect(rejected).toBeTypeOf("function");
  });
});

describe("track", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs the payload with a random 128-bit session ID", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    track({ name: "flow_started", source: "sample" });
    const calls: unknown[][] = info.mock.calls;
    expect(calls).toHaveLength(1);
    const [label, payload] = calls[0] ?? [];
    expect(label).toBe("[telemetry]");
    expect(payload).toEqual({ name: "flow_started", source: "sample", session: (payload as TelemetryPayload).session });
    expect((payload as TelemetryPayload).session).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe("priceBucket", () => {
  it.each([
    [1, "<300"],
    [29999, "<300"],
    [30000, "300–1000"],
    [99999, "300–1000"],
    [100000, "1000–3000"],
    [300000, "1000–3000"],
    [300001, ">3000"],
    [100_000_000, ">3000"],
  ] as const)("puts %i cents in %s", (price, bucket) => {
    expect(priceBucket(cents(price))).toBe(bucket);
  });
});

describe("instalmentBucket", () => {
  it.each([
    [3, "3"],
    [6, "6"],
    [12, "12"],
    [2, "custom"],
    [4, "custom"],
    [24, "custom"],
  ] as const)("records %i instalments as %s", (count, bucket) => {
    expect(instalmentBucket(count)).toBe(bucket);
  });
});

describe("importFailed", () => {
  it("records the error's code only", () => {
    expect(importFailed({ code: "missing-columns", missing: ["Date", "Outflow"] })).toEqual({
      name: "import_failed",
      reason: "missing-columns",
    });
    expect(importFailed({ code: "bad-amount", line: 4, column: "Outflow", value: "12,3,4" })).toEqual({
      name: "import_failed",
      reason: "bad-amount",
    });
  });

  it("records a file that loads but can't be summarised", () => {
    expect(importFailed({ code: "too-little-data", fullMonths: 2, droppedMonths: [] })).toEqual({
      name: "import_failed",
      reason: "too-little-data",
    });
    expect(importFailed({ code: "no-income" })).toEqual({ name: "import_failed", reason: "no-income" });
  });

  it("records a failure no check describes as unreadable", () => {
    expect(importFailed(null)).toEqual({ name: "import_failed", reason: "unreadable" });
  });
});

describe("planChecked", () => {
  it("records the verdict and the plan in buckets", () => {
    expect(planChecked(plan(), "no-fit")).toEqual({
      name: "plan_checked",
      verdict: "no-fit",
      instalments: "12",
      priceBucket: "1000–3000",
      hasInterest: false,
    });
  });

  it("buckets the full price, upfront payment included", () => {
    expect(planChecked(plan({ price: cents(350000), upfront: cents(100000), count: 5 }), "fits")).toMatchObject({
      instalments: "custom",
      priceBucket: ">3000",
    });
  });

  it("counts any interest rate above zero as interest", () => {
    expect(planChecked(plan({ annualRateBps: 1 }), "fits").hasInterest).toBe(true);
  });

  it("doesn't count a monthly fee as interest", () => {
    expect(planChecked(plan({ monthlyFee: cents(500) }), "fits").hasInterest).toBe(false);
  });
});
