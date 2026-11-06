"use client";

import { useEffect, useMemo, useReducer, useRef } from "react";
import { summarise, type SummaryResult } from "@/lib/budget/summary";
import { SAMPLE_REFERENCE_MONTH } from "@/lib/constants";
import { getMessages, type Locale, type Messages } from "@/lib/i18n";
import { parseTransactions } from "@/lib/import/parse";
import { assessPlan, type Affordability } from "@/lib/plan/affordability";
import { checkPlanForm, type PlanFormResult } from "@/lib/plan/form";
import { readSampleLink, writeSampleLink, type SampleLink, type SampleProfile } from "@/lib/sample-link";
import {
  flowReducer,
  initialFlow,
  STEPS,
  type FlowAction,
  type FlowData,
  type FlowState,
  type Step,
} from "./flow-state";
import { BrandMark } from "./icons";
import { Landing } from "./landing";
import { Purchase } from "./purchase";
import { Result } from "./result";
import { Summary } from "./summary";

/** The step kept in each browser history entry, so Back and Forward move between steps. */
interface HistoryStep {
  mmStep?: unknown;
}

const isStep = (value: unknown): value is Step => STEPS.some((step) => step === value);

/**
 * Fetches a sample file and runs it through the same parser and summary as an upload would.
 * @throws When the fetch fails or the sample can't be summarised (a broken deploy).
 */
async function loadSample(locale: Locale, profile: SampleProfile, signal: AbortSignal): Promise<FlowData> {
  const response = await fetch(`/samples/${locale}_${profile}.tsv`, { signal });
  if (!response.ok) {
    throw new Error(`Sample request failed: ${response.status}`);
  }
  const file = parseTransactions(await response.text());
  const summary = file.ok ? summarise(file, SAMPLE_REFERENCE_MONTH) : undefined;
  if (!file.ok || !summary?.ok) {
    throw new Error("Sample data can't be summarised");
  }
  return { profile, file, reference: SAMPLE_REFERENCE_MONTH, fullMonthCount: summary.summary.fullMonths.length };
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
 * can open any step; each step change adds a history entry so the browser's
 * Back button goes to the previous step.
 */
export function Flow({ locale }: { locale: Locale }) {
  const t = getMessages(locale);
  const [state, dispatch] = useReducer(flowReducer, initialFlow);
  const { step, data, period, form } = state;

  const summary = useMemo(() => (data ? summarise(data.file, data.reference, period) : null), [data, period]);
  const plan = useMemo(() => checkPlanForm(form), [form]);
  const assessment = useMemo(
    () =>
      data && summary?.ok && plan.ok ? assessPlan(summary.summary, plan.schedule.instalments, data.reference) : null,
    [data, summary, plan],
  );

  // The landing keeps a bare URL even with data loaded (after Back), so reloading it opens the landing.
  const query =
    data && step !== "landing"
      ? writeSampleLink({ profile: data.profile, period, plan: step === "result" && plan.ok ? plan.input : undefined })
      : "";

  const loadController = useRef<AbortController | null>(null);
  const start = (profile: SampleProfile, link?: SampleLink) => {
    loadController.current?.abort();
    const controller = new AbortController();
    loadController.current = controller;
    dispatch({ type: "load-start", profile });
    loadSample(locale, profile, controller.signal).then(
      (loaded) => {
        dispatch({ type: "loaded", data: loaded, period: link?.period, plan: link?.plan });
      },
      () => {
        if (!controller.signal.aborted) {
          dispatch({ type: "load-failed" });
        }
      },
    );
  };

  // Opened from a sample link: load it. The URL stays as it is until the data is in.
  const fromLink = useRef(false);
  useEffect(() => {
    const link = readSampleLink(new URLSearchParams(window.location.search));
    if (link) {
      fromLink.current = true;
      start(link.profile, link);
    }
    return () => loadController.current?.abort();
    // Runs once on mount: the link is read from the URL the page was opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Back / Forward: go to the step that history entry recorded.
  const fromHistory = useRef(false);
  useEffect(() => {
    const onPop = (event: PopStateEvent) => {
      const recorded = (event.state as HistoryStep | null)?.mmStep;
      fromHistory.current = true;
      dispatch({ type: "go", step: isStep(recorded) ? recorded : "landing" });
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
    const entry: HistoryStep = { mmStep: step };
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
    <div className="mm mm-page">
      <Header
        t={t}
        locale={locale}
        query={query}
        showSample={data !== null && step !== "landing"}
        onReset={() => {
          dispatch({ type: "reset" });
        }}
      />
      <main className="mm-col mm-main">
        <StepView
          t={t}
          locale={locale}
          state={state}
          summary={summary}
          plan={plan}
          assessment={assessment}
          dispatch={dispatch}
          onSample={(profile) => {
            start(profile);
          }}
        />
      </main>
      <footer className="mm-foot">
        <div className="mm-col">{t.footer}</div>
      </footer>
    </div>
  );
}

/**
 * The top bar: brand (back to the start), the sample badge and "Start over"
 * once data is loaded, and the language switch, which keeps the sample query.
 */
function Header({
  t,
  locale,
  query,
  showSample,
  onReset,
}: {
  t: Messages;
  locale: Locale;
  query: string;
  showSample: boolean;
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
          {showSample && (
            <>
              <span className="mm-pill">{t.header.sampleBadge}</span>
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

/** The current step's screen. Renders nothing for a step whose data is missing (the reducer prevents that). */
function StepView({
  t,
  locale,
  state,
  summary,
  plan,
  assessment,
  dispatch,
  onSample,
}: {
  t: Messages;
  locale: Locale;
  state: FlowState;
  summary: SummaryResult | null;
  plan: PlanFormResult;
  assessment: Affordability | null;
  dispatch: (action: FlowAction) => void;
  onSample: (profile: SampleProfile) => void;
}) {
  const { step, data } = state;
  if (step === "landing") {
    return <Landing t={t} loading={state.loading} loadFailed={state.loadFailed} onSample={onSample} />;
  }
  if (data === null || summary === null) {
    return null;
  }
  if (step === "summary") {
    return (
      <Summary
        t={t}
        locale={locale}
        result={summary}
        rowCount={data.file.rows.length}
        fullMonthCount={data.fullMonthCount}
        period={state.period}
        onPeriod={(months) => {
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
  return summary.ok && plan.ok && assessment ? (
    <Result
      t={t}
      locale={locale}
      summary={summary.summary}
      input={plan.input}
      schedule={plan.schedule}
      assessment={assessment}
      onChange={() => {
        dispatch({ type: "go", step: "purchase" });
      }}
      onBack={() => {
        dispatch({ type: "go", step: "summary" });
      }}
    />
  ) : null;
}
