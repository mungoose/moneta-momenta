import { defaultPeriodLength, periodOptions } from "@/lib/budget/summary";
import { DEFAULT_PERIOD_MONTHS, DEFAULT_RATE_BPS, INSTALMENT_PRESETS } from "@/lib/constants";
import type { LoadedData, LoadError } from "@/lib/load";
import { checkPlanForm, formatRateInput, type PlanForm } from "@/lib/plan/form";
import type { SampleProfile } from "@/lib/sample-link";

/** The flow's screens, in order. */
export const STEPS = ["landing", "summary", "purchase", "result"] as const;

/** One of {@link STEPS}. */
export type Step = (typeof STEPS)[number];

/** Where the loaded transactions came from. */
export type DataSource =
  | { kind: "sample"; profile: SampleProfile }
  /** `id` tells two uploads apart, even of the same file, so history entries of an earlier one aren't shown with a later one. */
  | { kind: "upload"; name: string; id: number };

/** What is being loaded: a sample, or an uploaded file by name. */
export type Loading = { kind: "sample"; profile: SampleProfile } | { kind: "upload"; name: string };

/** Loaded transactions and where they came from. */
export interface FlowData extends LoadedData {
  source: DataSource;
}

/** An upload that can't be used. `error` is `null` when reading failed in a way no check describes. */
export interface UploadError {
  error: LoadError | null;
  fileName: string;
}

/**
 * Identifies the loaded data in a history entry, so Back / Forward into an
 * entry made for other data (an earlier upload, the other sample) can tell.
 * @param data  The loaded data, if any.
 * @returns     `sample:<profile>`, `upload:<id>`, or `null` without data.
 */
export function dataKey(data: FlowData | null): string | null {
  if (data === null) {
    return null;
  }
  return data.source.kind === "sample" ? `sample:${data.source.profile}` : `upload:${String(data.source.id)}`;
}

/** Whether a {@link dataKey} names an upload. */
export const isUploadKey = (key: string | null): boolean => key?.startsWith("upload:") ?? false;

/** Everything the flow keeps. Summaries and plans are derived from it, never stored. */
export interface FlowState {
  step: Step;
  /** The sample being fetched or the file being read, if any. */
  loading: Loading | null;
  /** The sample didn't arrive (a network problem, not the data). */
  loadFailed: boolean;
  /** The last upload can't be used; the landing shows why instead of its usual content. */
  uploadError: UploadError | null;
  /**
   * The page was reloaded, or reached through Back / Forward or the language
   * switch, where an upload had been: the file isn't kept, so the landing says
   * to upload it again.
   */
  uploadGone: boolean;
  data: FlowData | null;
  period: number;
  form: PlanForm;
  /** The "Custom" instalment option is chosen, so the count is typed in. */
  customCount: boolean;
  /** Field errors show only after the first "Check affordability", then stay live. */
  showErrors: boolean;
  /** Bumped on every submit with errors, so the form can move focus to the first one. */
  failedSubmits: number;
  /** Bumped on every submit that opens the result, so telemetry counts each check once. */
  checks: number;
}

/** What can happen in the flow. */
export type FlowAction =
  | { type: "load-start"; loading: Loading }
  | { type: "load-failed" }
  | { type: "upload-failed"; error: UploadError }
  | { type: "upload-gone" }
  /** Data arrived; `period` and `plan` come from a sample link and are checked here. */
  | { type: "loaded"; data: FlowData; period?: number; plan?: PlanForm }
  | { type: "set-period"; period: number }
  /**
   * Open a step. `entry` is set when Back / Forward caused it: the
   * {@link dataKey} the history entry was made with, or `null` if none.
   */
  | { type: "go"; step: Step; entry?: string | null }
  | { type: "edit"; field: keyof PlanForm; value: string }
  | { type: "set-count"; count: number | "custom" }
  | { type: "submit" }
  | { type: "reset" };

/** The purchase prefilled for the sample: big enough that July 2027 doesn't fit on the default period. */
const SAMPLE_FORM: PlanForm = {
  price: "1200",
  upfront: "0",
  count: "12",
  rate: formatRateInput(DEFAULT_RATE_BPS),
  fee: "0",
};

/** The flow before anything is loaded. */
export const initialFlow: FlowState = {
  step: "landing",
  loading: null,
  loadFailed: false,
  uploadError: null,
  uploadGone: false,
  data: null,
  period: DEFAULT_PERIOD_MONTHS,
  form: SAMPLE_FORM,
  customCount: false,
  showErrors: false,
  failedSubmits: 0,
  checks: 0,
};

const isPreset = (count: string) => INSTALMENT_PRESETS.some((preset) => String(preset) === count);

/**
 * The step a request may actually open: steps after landing need data, and
 * the result needs a plan that passes its checks.
 */
function reachable(state: FlowState, step: Step): Step {
  if (state.data === null) {
    return "landing";
  }
  if (step === "result" && !checkPlanForm(state.form).ok) {
    return "purchase";
  }
  return step;
}

/** Data arrived: start over on it, taking the period and plan from a sample link when they pass. */
function onLoaded(action: Extract<FlowAction, { type: "loaded" }>): FlowState {
  const { data, period, plan } = action;
  const next: FlowState = {
    ...initialFlow,
    data,
    period:
      period !== undefined && periodOptions(data.fullMonthCount).includes(period)
        ? period
        : defaultPeriodLength(data.fullMonthCount),
    form: plan ?? SAMPLE_FORM,
    customCount: plan !== undefined && !isPreset(plan.count),
    // A link whose plan doesn't pass opens the form with its errors showing.
    showErrors: plan !== undefined,
  };
  return { ...next, step: reachable(next, plan ? "result" : "summary") };
}

/**
 * Open a step. From history, an entry made for other data than what's loaded
 * opens the landing instead: its figures are gone, and showing the current
 * data under it would mix up two files.
 */
function onGo(state: FlowState, step: Step, entry: string | null | undefined): FlowState {
  if (entry !== undefined && step !== "landing" && entry !== dataKey(state.data)) {
    return { ...state, step: "landing", uploadGone: isUploadKey(entry) };
  }
  return { ...state, step: reachable(state, step) };
}

/** "Check affordability": open the result, or stay on the form and show its errors. */
function onSubmit(state: FlowState): FlowState {
  const step = reachable(state, "result");
  return step === "result"
    ? { ...state, step, showErrors: false, checks: state.checks + 1 }
    : { ...state, step, showErrors: true, failedSubmits: state.failedSubmits + 1 };
}

/** A preset count fills the field; "Custom" keeps what's typed and shows the field. */
function onSetCount(state: FlowState, count: number | "custom"): FlowState {
  return count === "custom"
    ? { ...state, customCount: true }
    : { ...state, customCount: false, form: { ...state.form, count: String(count) } };
}

/** Actions about getting data in, handled by {@link onLoadAction}. */
type LoadAction = Extract<
  FlowAction,
  { type: "load-start" | "load-failed" | "upload-failed" | "upload-gone" | "loaded" }
>;

const LOAD_ACTIONS: ReadonlySet<FlowAction["type"]> = new Set<LoadAction["type"]>([
  "load-start",
  "load-failed",
  "upload-failed",
  "upload-gone",
  "loaded",
]);

const isLoadAction = (action: FlowAction): action is LoadAction => LOAD_ACTIONS.has(action.type);

/** A sample or file starts loading, arrives, or fails. */
function onLoadAction(state: FlowState, action: LoadAction): FlowState {
  switch (action.type) {
    case "load-start":
      return { ...state, loading: action.loading, loadFailed: false, uploadError: null, uploadGone: false };
    case "load-failed":
      return { ...state, loading: null, loadFailed: true };
    case "upload-failed":
      // Shown on the landing, which keeps its history entry: Back still leaves the page, as it would from the landing.
      return { ...state, step: "landing", loading: null, uploadError: action.error };
    case "upload-gone":
      return { ...state, uploadGone: true };
    case "loaded":
      return onLoaded(action);
  }
}

/** The flow's reducer. Every transition goes through {@link reachable}, so no screen shows without its data. */
export function flowReducer(state: FlowState, action: FlowAction): FlowState {
  if (isLoadAction(action)) {
    return onLoadAction(state, action);
  }
  switch (action.type) {
    case "set-period":
      return { ...state, period: action.period };
    case "go":
      return onGo(state, action.step, action.entry);
    case "edit":
      return { ...state, form: { ...state.form, [action.field]: action.value } };
    case "set-count":
      return onSetCount(state, action.count);
    case "submit":
      return onSubmit(state);
    case "reset":
      return initialFlow;
  }
}
