import type { YearMonth } from "@/lib/budget/months";
import { defaultPeriodLength, periodOptions } from "@/lib/budget/summary";
import { DEFAULT_PERIOD_MONTHS, INSTALMENT_PRESETS } from "@/lib/constants";
import type { ParsedFile } from "@/lib/import/types";
import { checkPlanForm, type PlanForm } from "@/lib/plan/form";
import type { SampleProfile } from "@/lib/sample-link";

/** The flow's screens, in order. */
export const STEPS = ["landing", "summary", "purchase", "result"] as const;

/** One of {@link STEPS}. */
export type Step = (typeof STEPS)[number];

/** Loaded transactions. Only sample data so far; uploads join here later. */
export interface FlowData {
  profile: SampleProfile;
  file: ParsedFile;
  /** The first unfinished month the summary and plan count from. */
  reference: YearMonth;
  fullMonthCount: number;
}

/** Everything the flow keeps. Summaries and plans are derived from it, never stored. */
export interface FlowState {
  step: Step;
  /** The sample being fetched, if any. */
  loading: SampleProfile | null;
  loadFailed: boolean;
  data: FlowData | null;
  period: number;
  form: PlanForm;
  /** The "Custom" instalment option is chosen, so the count is typed in. */
  customCount: boolean;
  /** Field errors show only after the first "Check affordability", then stay live. */
  showErrors: boolean;
  /** Bumped on every submit with errors, so the form can move focus to the first one. */
  failedSubmits: number;
}

/** What can happen in the flow. */
export type FlowAction =
  | { type: "load-start"; profile: SampleProfile }
  | { type: "load-failed" }
  /** Data arrived; `period` and `plan` come from a sample link and are checked here. */
  | { type: "loaded"; data: FlowData; period?: number; plan?: PlanForm }
  | { type: "set-period"; period: number }
  | { type: "go"; step: Step }
  | { type: "edit"; field: keyof PlanForm; value: string }
  | { type: "set-count"; count: number | "custom" }
  | { type: "submit" }
  | { type: "reset" };

/** The purchase prefilled for the sample: big enough that July 2027 doesn't fit on the default period. */
const SAMPLE_FORM: PlanForm = { price: "1200", upfront: "0", count: "12", rate: "0", fee: "0" };

/** The flow before anything is loaded. */
export const initialFlow: FlowState = {
  step: "landing",
  loading: null,
  loadFailed: false,
  data: null,
  period: DEFAULT_PERIOD_MONTHS,
  form: SAMPLE_FORM,
  customCount: false,
  showErrors: false,
  failedSubmits: 0,
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

/** "Check affordability": open the result, or stay on the form and show its errors. */
function onSubmit(state: FlowState): FlowState {
  const step = reachable(state, "result");
  return step === "result"
    ? { ...state, step, showErrors: false }
    : { ...state, step, showErrors: true, failedSubmits: state.failedSubmits + 1 };
}

/** A preset count fills the field; "Custom" keeps what's typed and shows the field. */
function onSetCount(state: FlowState, count: number | "custom"): FlowState {
  return count === "custom"
    ? { ...state, customCount: true }
    : { ...state, customCount: false, form: { ...state.form, count: String(count) } };
}

/** The flow's reducer. Every transition goes through {@link reachable}, so no screen shows without its data. */
export function flowReducer(state: FlowState, action: FlowAction): FlowState {
  switch (action.type) {
    case "load-start":
      return { ...state, loading: action.profile, loadFailed: false };
    case "load-failed":
      return { ...state, loading: null, loadFailed: true };
    case "loaded":
      return onLoaded(action);
    case "set-period":
      return { ...state, period: action.period };
    case "go":
      return { ...state, step: reachable(state, action.step) };
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
