"use client";

import { useEffect, useMemo, useReducer, useRef } from "react";
import { referenceMonth } from "@/lib/budget/months";
import { summarise, type SummaryResult } from "@/lib/budget/summary";
import { SAMPLE_REFERENCE_MONTH } from "@/lib/constants";
import { guardRange, type Guarded } from "@/lib/guard";
import { getMessages, type Locale, type Messages } from "@/lib/i18n";
import { loadFile, loadText, type LoadedData } from "@/lib/load";
import { assessPlan, type Affordability } from "@/lib/plan/affordability";
import { checkPlanForm, type PlanFormResult } from "@/lib/plan/form";
import { readSampleLink, writeSampleLink, type SampleLink, type SampleProfile } from "@/lib/sample-link";
import { importFailed, planChecked, track } from "@/lib/telemetry";
import {
  dataKey,
  flowReducer,
  initialFlow,
  isUploadKey,
  STEPS,
  type FlowAction,
  type FlowState,
  type Step,
} from "./flow-state";
import { BrandMark } from "./icons";
import { Landing } from "./landing";
import { Purchase } from "./purchase";
import { Result } from "./result";
import { StepBoundary } from "./step-boundary";
import { Summary, Unexpected } from "./summary";
import { uploadErrorTitle, UploadErrorView } from "./upload-error";

/**
 * What each browser history entry keeps, so Back and Forward move between
 * steps: the step, and the {@link dataKey} of the data it showed. Only the
 * key: an upload's figures never go into history.
 */
interface HistoryStep {
  mmStep?: unknown;
  mmData?: unknown;
}

const isStep = (value: unknown): value is Step => STEPS.some((step) => step === value);

/**
 * Query flag the language switch adds while an upload is shown. The other
 * locale's page can't have the file, so it opens the landing with the
 * "upload it again" note. Nothing about the file goes in the URL.
 */
const UPLOAD_GONE_PARAM = "upload";

/**
 * Fetches a sample file and runs it through the same load pipeline as an upload.
 * @throws When the fetch fails or the sample can't be loaded (a broken deploy).
 */
async function loadSample(locale: Locale, profile: SampleProfile, signal: AbortSignal): Promise<LoadedData> {
  const response = await fetch(`/samples/${locale}_${profile}.tsv`, { signal });
  if (!response.ok) {
    throw new Error(`Sample request failed: ${response.status}`);
  }
  const result = loadText(await response.text(), SAMPLE_REFERENCE_MONTH);
  if (!result.ok) {
    throw new Error(`Sample data can't be loaded: ${result.error.code}`);
  }
  return result.data;
}

/**
 * The page's query and the language switch's. Only sample data goes into the
 * URL; while an upload is shown, the switch carries just a flag, so the other
 * locale can say why the file is gone. The landing keeps a bare URL even
 * with data loaded (after Back), so reloading it opens the landing.
 */
function queries(state: FlowState, plan: PlanFormResult): { query: string; switchQuery: string } {
  const { data, step, period } = state;
  if (data === null || step === "landing") {
    return { query: "", switchQuery: "" };
  }
  if (data.source.kind === "upload") {
    return { query: "", switchQuery: `?${UPLOAD_GONE_PARAM}` };
  }
  const query = writeSampleLink({
    profile: data.source.profile,
    period,
    plan: step === "result" && plan.ok ? plan.input : undefined,
  });
  return { query, switchQuery: query };
}

/** Whether a history entry (after a reload, the current one) showed an upload past the landing. */
function showedUpload(entry: HistoryStep | null): boolean {
  return (
    isStep(entry?.mmStep) && entry.mmStep !== "landing" && typeof entry.mmData === "string" && isUploadKey(entry.mmData)
  );
}

/**
 * The browser tab title for what's on screen, so tabs, history and screen
 * readers can tell the steps, the result and an error apart.
 */
function documentTitle(
  t: Messages,
  state: FlowState,
  summary: Guarded<SummaryResult> | null,
  assessment: Guarded<Affordability> | null,
): string {
  const view = viewTitle(t, state, summary, assessment);
  return view === null ? t.meta.title : `${view} – ${t.meta.title}`;
}

/** The current view's own title, or `null` for the landing, which has the app name alone. */
function viewTitle(
  t: Messages,
  state: FlowState,
  summary: Guarded<SummaryResult> | null,
  assessment: Guarded<Affordability> | null,
): string | null {
  if (state.step === "landing") {
    return state.uploadError ? uploadErrorTitle(t, state.uploadError.error) : null;
  }
  if (summary === null) {
    return null;
  }
  if (!summary.ok || !summary.value.ok) {
    return t.unexpectedTitle;
  }
  if (state.step === "summary") {
    return t.titles.summary;
  }
  if (state.step === "purchase") {
    return t.titles.purchase;
  }
  return assessment?.ok ? t.titles.result(t.status[assessment.value.verdict]) : t.unexpectedTitle;
}

/** How the URL-sync effect records a render in the browser history. */
type HistoryWrite = "wait" | "push" | "replace";

/**
 * Whether a render gets a new history entry, updates the current one, or
 * leaves the URL alone for now.
 *
 * It waits while a sample loads, and while a sample link's data is still on
 * its way (the link's query must survive until then). Only a step change made
 * in the app pushes: one that came from Back / Forward or from opening a link
 * replaces, or Back would loop.
 */
function historyWrite(input: {
  step: Step;
  lastStep: Step | null;
  loading: boolean;
  hasData: boolean;
  loadFailed: boolean;
  fromHistory: boolean;
  fromLink: boolean;
}): HistoryWrite {
  const { step, lastStep, fromHistory, fromLink } = input;
  if (input.loading || (fromLink && !input.hasData && !input.loadFailed)) {
    return "wait";
  }
  return lastStep !== null && lastStep !== step && !fromHistory && !fromLink ? "push" : "replace";
}

/**
 * The whole affordability check on one page: landing → summary → purchase →
 * result, kept in a reducer. Sample data is mirrored into the URL so a link
 * can open any step; uploaded data never is. Each step change adds a history
 * entry so the browser's Back button goes to the previous step.
 */
export function Flow({ locale }: { locale: Locale }) {
  const t = getMessages(locale);
  const [state, dispatch] = useReducer(flowReducer, initialFlow);
  const { step, data, period, form } = state;

  // Both run while the page renders, so a total past the safe-integer range comes back as a value, not a crash.
  const summary = useMemo(
    () => (data ? guardRange(() => summarise(data.file, data.reference, period)) : null),
    [data, period],
  );
  const plan = useMemo(() => checkPlanForm(form), [form]);
  const assessment = useMemo(() => {
    const result = summary?.ok ? summary.value : null;
    return data && result?.ok && plan.ok
      ? guardRange(() => assessPlan(result.summary, plan.schedule.instalments, data.reference))
      : null;
  }, [data, summary, plan]);

  const shown = data !== null && step !== "landing";
  const { query, switchQuery } = queries(state, plan);

  // One load at a time: starting another (sample or upload) makes the earlier one's result be ignored.
  const loadController = useRef<AbortController | null>(null);
  const begin = () => {
    loadController.current?.abort();
    const controller = new AbortController();
    loadController.current = controller;
    return controller.signal;
  };

  const start = (profile: SampleProfile, link?: SampleLink) => {
    const signal = begin();
    dispatch({ type: "load-start", loading: { kind: "sample", profile } });
    loadSample(locale, profile, signal).then(
      (loaded) => {
        dispatch({
          type: "loaded",
          data: { ...loaded, source: { kind: "sample", profile } },
          period: link?.period,
          plan: link?.plan,
        });
      },
      () => {
        if (!signal.aborted) {
          dispatch({ type: "load-failed" });
        }
      },
    );
  };

  const upload = (file: File) => {
    track({ name: "flow_started", source: "upload" });
    const signal = begin();
    const name = file.name;
    dispatch({ type: "load-start", loading: { kind: "upload", name } });
    // Counted from the user's own month: the unfinished current month is left out.
    loadFile(file, referenceMonth(new Date())).then(
      (result) => {
        if (signal.aborted) {
          return;
        }
        if (!result.ok) {
          track(importFailed(result.error));
        }
        dispatch(
          result.ok
            ? { type: "loaded", data: { ...result.data, source: { kind: "upload", name, id: Date.now() } } }
            : { type: "upload-failed", error: { error: result.error, fileName: name } },
        );
      },
      () => {
        // A total past the safe-integer range, or the browser failing to read the file.
        if (!signal.aborted) {
          track(importFailed(null));
          dispatch({ type: "upload-failed", error: { error: null, fileName: name } });
        }
      },
    );
  };

  // On mount: a sample link loads its sample, and the URL stays as it is until the data is in.
  // A reload or a language switch where an upload was shown gets the "upload it again" note.
  const fromLink = useRef(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const link = readSampleLink(params);
    if (link) {
      fromLink.current = true;
      start(link.profile, link);
    } else if (params.has(UPLOAD_GONE_PARAM) || showedUpload(window.history.state as HistoryStep | null)) {
      dispatch({ type: "upload-gone" });
    }
    return () => loadController.current?.abort();
    // Runs once on mount: the link is read from the URL the page was opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // One plan_checked per "Check affordability" that opens a result, with the verdict on screen.
  // A sample link that opens a result, Back / Forward and re-renders don't bump `checks`, so they send nothing.
  const countedChecks = useRef(0);
  useEffect(() => {
    if (state.checks === countedChecks.current) {
      return;
    }
    countedChecks.current = state.checks;
    const result = assessment?.ok ? assessment.value : null;
    if (state.checks > 0 && plan.ok && result) {
      track(planChecked(plan.input, result.verdict));
    }
  }, [state.checks, plan, assessment]);

  const title = documentTitle(t, state, summary, assessment);
  useEffect(() => {
    document.title = title;
  }, [title]);

  // Back / Forward: go to the step that history entry recorded, if it was made for the data loaded now.
  const fromHistory = useRef(false);
  useEffect(() => {
    const onPop = (event: PopStateEvent) => {
      const recorded = event.state as HistoryStep | null;
      fromHistory.current = true;
      dispatch({
        type: "go",
        step: isStep(recorded?.mmStep) ? recorded.mmStep : "landing",
        entry: typeof recorded?.mmData === "string" ? recorded.mmData : null,
      });
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
    };
  }, []);

  // Mirror the step and sample settings into the URL: a new history entry per step, in place otherwise.
  const lastStep = useRef<Step | null>(null);
  useEffect(() => {
    const write = historyWrite({
      step,
      lastStep: lastStep.current,
      loading: state.loading !== null,
      hasData: data !== null,
      loadFailed: state.loadFailed,
      fromHistory: fromHistory.current,
      fromLink: fromLink.current,
    });
    if (write === "wait") {
      return;
    }
    const url = `${window.location.pathname}${query}`;
    const entry: HistoryStep = { mmStep: step, mmData: dataKey(data) };
    if (write === "push") {
      window.history.pushState(entry, "", url);
    } else {
      window.history.replaceState(entry, "", url);
    }
    // A step change moves focus to the new step's heading, so keyboard and screen reader users start at the top.
    if (lastStep.current !== null && lastStep.current !== step) {
      window.scrollTo(0, 0);
      document.getElementById("step-title")?.focus();
    }
    lastStep.current = step;
    fromHistory.current = false;
    fromLink.current = false;
  }, [step, query, data, state.loading, state.loadFailed]);

  return (
    <div className="mm-page">
      <Header
        t={t}
        locale={locale}
        query={switchQuery}
        shown={shown}
        sample={data?.source.kind === "sample"}
        onReset={() => {
          dispatch({ type: "reset" });
        }}
      />
      <main className="mm-col mm-main">
        <StepBoundary key={`${step}:${dataKey(data) ?? ""}`} t={t}>
          <StepView
            t={t}
            locale={locale}
            state={state}
            summary={summary}
            plan={plan}
            assessment={assessment}
            dispatch={dispatch}
            onSample={(profile) => {
              track({ name: "flow_started", source: "sample" });
              start(profile);
            }}
            onUpload={upload}
          />
        </StepBoundary>
      </main>
      <footer className="mm-foot">
        <div className="mm-col flex flex-col gap-2">
          <p>{t.footer}</p>
          <p>{t.footerPrivacy}</p>
        </div>
      </footer>
    </div>
  );
}

/**
 * The top bar: brand (back to the start), "Start over" (and the sample badge
 * for sample data) past the landing, and the language switch, which keeps
 * the sample query.
 */
function Header({
  t,
  locale,
  query,
  shown,
  sample,
  onReset,
}: {
  t: Messages;
  locale: Locale;
  query: string;
  /** Data is loaded and a step past the landing is open. */
  shown: boolean;
  sample: boolean;
  onReset: () => void;
}) {
  const otherLocale: Locale = locale === "en" ? "et" : "en";
  return (
    <header className="mm-top">
      <div className="mm-col mm-top__in">
        <a
          className="mm-brand"
          href={`/${locale}`}
          aria-label={t.header.home}
          onClick={(event) => {
            event.preventDefault();
            onReset();
          }}
        >
          <BrandMark />
          {t.header.appName}
        </a>
        <div className="flex items-center gap-2">
          {shown && (
            <>
              {sample && <span className="mm-pill">{t.header.sampleBadge}</span>}
              <button type="button" className="mm-btn mm-btn--ghost" onClick={onReset}>
                {t.header.startOver}
              </button>
            </>
          )}
          <a
            className="mm-btn mm-btn--ghost"
            href={`/${otherLocale}${query}`}
            hrefLang={otherLocale}
            lang={otherLocale}
          >
            {t.header.languageSwitch}
          </a>
        </div>
      </div>
    </header>
  );
}

/**
 * The current step's screen. Renders nothing for a step whose data is
 * missing (the reducer prevents that), and the "Something went wrong"
 * callout when a total left the safe-integer range.
 */
function StepView({
  t,
  locale,
  state,
  summary,
  plan,
  assessment,
  dispatch,
  onSample,
  onUpload,
}: {
  t: Messages;
  locale: Locale;
  state: FlowState;
  /** `ok: false` when a total left the safe-integer range. */
  summary: Guarded<SummaryResult> | null;
  plan: PlanFormResult;
  assessment: Guarded<Affordability> | null;
  dispatch: (action: FlowAction) => void;
  onSample: (profile: SampleProfile) => void;
  onUpload: (file: File) => void;
}) {
  const { step, data } = state;
  if (step === "landing") {
    return state.uploadError ? (
      <UploadErrorView
        t={t}
        locale={locale}
        failure={state.uploadError}
        loading={state.loading}
        onSample={() => {
          onSample("comfortable");
        }}
        onUpload={onUpload}
      />
    ) : (
      <Landing
        t={t}
        locale={locale}
        loading={state.loading}
        loadFailed={state.loadFailed}
        uploadGone={state.uploadGone}
        onSample={onSample}
        onUpload={onUpload}
      />
    );
  }
  if (data === null || summary === null) {
    return null;
  }
  if (step === "summary") {
    if (!summary.ok) {
      return <Unexpected t={t} />;
    }
    return (
      <Summary
        t={t}
        locale={locale}
        result={summary.value}
        source={data.source}
        reference={data.reference}
        rowCount={data.file.rows.length}
        fullMonthCount={data.fullMonthCount}
        period={state.period}
        onPeriod={(months) => {
          if (months !== state.period) {
            track({ name: "period_changed", months });
          }
          dispatch({ type: "set-period", period: months });
        }}
        onContinue={() => {
          dispatch({ type: "go", step: "purchase" });
        }}
      />
    );
  }
  if (step === "purchase") {
    return (
      <Purchase
        t={t}
        locale={locale}
        form={state.form}
        plan={plan}
        customCount={state.customCount}
        showErrors={state.showErrors}
        failedSubmits={state.failedSubmits}
        reference={data.reference}
        onEdit={(field, value) => {
          dispatch({ type: "edit", field, value });
        }}
        onCount={(count) => {
          dispatch({ type: "set-count", count });
        }}
        onSubmit={() => {
          dispatch({ type: "submit" });
        }}
        onBack={() => {
          dispatch({ type: "go", step: "summary" });
        }}
      />
    );
  }
  return <ResultStep t={t} locale={locale} summary={summary} plan={plan} assessment={assessment} dispatch={dispatch} />;
}

/** The result step: the verdict, or the "Something went wrong" callout when a total left the safe-integer range. */
function ResultStep({
  t,
  locale,
  summary,
  plan,
  assessment,
  dispatch,
}: {
  t: Messages;
  locale: Locale;
  summary: Guarded<SummaryResult>;
  plan: PlanFormResult;
  assessment: Guarded<Affordability> | null;
  dispatch: (action: FlowAction) => void;
}) {
  return summary.ok && summary.value.ok && plan.ok && assessment?.ok ? (
    <Result
      t={t}
      locale={locale}
      summary={summary.value.summary}
      input={plan.input}
      schedule={plan.schedule}
      assessment={assessment.value}
      onChange={() => {
        dispatch({ type: "go", step: "purchase" });
      }}
      onBack={() => {
        dispatch({ type: "go", step: "summary" });
      }}
      onExplain={() => {
        track({ name: "explanation_opened" });
      }}
    />
  ) : (
    <Unexpected t={t} />
  );
}
