"use client";

import { useEffect, useRef, useState } from "react";
import type { DataSummary } from "@/lib/budget/summary";
import { BUFFER_BPS } from "@/lib/constants";
import type { Locale, Messages } from "@/lib/i18n";
import { formatMonth, formatPercent } from "@/lib/i18n/format";
import { toCents, type Cents } from "@/lib/money/cents";
import { formatCents } from "@/lib/money/format";
import type { Affordability, PlanMonth } from "@/lib/plan/affordability";
import type { PlanInput, Schedule } from "@/lib/plan/schedule";
import { CloseIcon, InfoIcon, StatusChip, StatusIcon } from "./icons";

/** Everything the explanation shows. It adds no maths of its own: each figure is one the result already uses. */
interface ExplanationFacts {
  t: Messages;
  summary: DataSummary;
  input: PlanInput;
  schedule: Schedule;
  assessment: Affordability;
  /** The month with the least left over, which decides the verdict. */
  critical: PlanMonth;
  money: (value: Cents) => string;
  month: (value: string) => string;
  locale: Locale;
}

/**
 * "How we calculated this": a button that opens a drawer walking through the
 * result in four steps, with the user's own numbers. A native modal `<dialog>`
 * keeps focus inside it and closes on Esc. Its content is rendered only while
 * it's open, so the page's text isn't duplicated in hidden markup.
 */
export function Explanation({
  onOpen,
  ...facts
}: Omit<ExplanationFacts, "money" | "month"> & {
  /** Called each time the user opens it (telemetry). */
  onOpen: () => void;
}) {
  const e = facts.t.explanation;
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (open) {
      dialog.current?.showModal();
    }
  }, [open]);
  const close = () => {
    dialog.current?.close();
  };
  const all: ExplanationFacts = {
    ...facts,
    money: (value) => formatCents(value, facts.locale),
    month: (value) => formatMonth(value, facts.locale),
  };

  return (
    <>
      <button
        ref={opener}
        type="button"
        className="mm-btn mm-btn--secondary"
        onClick={() => {
          setOpen(true);
          onOpen();
        }}
      >
        <InfoIcon />
        {e.title}
      </button>
      {open && (
        // Clicking the dimmed backdrop closes it, like the design's scrim; Esc and both buttons do the same.
        <dialog
          ref={dialog}
          className="mm-drawer"
          aria-labelledby="calc-title"
          onClose={() => {
            setOpen(false);
            opener.current?.focus();
          }}
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              close();
            }
          }}
        >
          <div className="mm-drawer__head">
            <h2 className="mm-t-h2" id="calc-title">
              {e.title}
            </h2>
            <button type="button" className="mm-iconbtn" aria-label={e.close} onClick={close}>
              <CloseIcon />
            </button>
          </div>
          {/* It scrolls but holds nothing focusable, so without a tab stop the keyboard couldn't scroll it. */}
          <div className="mm-drawer__body" tabIndex={0}>
            <p className="mm-muted">{e.intro}</p>
            <MarginStep {...all} />
            <InstalmentStep {...all} />
            <SeasonalStep {...all} />
            <LeftoverStep {...all} />
            <div className="mm-callout mm-callout--warn">
              <StatusIcon status="tight" className="mm-ico mm-callout__icon" />
              <div className="mm-callout__content">
                <p className="mm-callout__title">{e.limitsTitle}</p>
                <p>{e.limitsBody}</p>
              </div>
            </div>
          </div>
          <div className="mm-drawer__foot">
            <button type="button" className="mm-btn mm-btn--secondary" onClick={close}>
              {e.close}
            </button>
          </div>
        </dialog>
      )}
    </>
  );
}

/** One numbered step: the number is decorative, the heading carries the meaning. */
function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="mm-calcstep">
      <span className="mm-calcstep__n" aria-hidden="true">
        {n}
      </span>
      <div className="mm-calcstep__c">
        <h3 className="mm-t-h3">{title}</h3>
        {children}
      </div>
    </div>
  );
}

/** Step 1: the averages and the period they cover. */
function MarginStep({ t, summary, money, month }: ExplanationFacts) {
  const e = t.explanation;
  const first = summary.period[0];
  const last = summary.period.at(-1);
  return (
    <Step n={1} title={e.marginTitle}>
      <p className="mm-formula">
        {e.marginFormula(money(summary.avgIncome), money(summary.avgSpending))} <strong>{money(summary.margin)}</strong>
      </p>
      {first !== undefined && last !== undefined && (
        <p className="mm-t-small mm-muted">{e.marginNote(summary.period.length, month(first), month(last))}</p>
      )}
    </Step>
  );
}

/** Step 2: from the price to the monthly instalment, with interest and fees only when the plan has them. */
function InstalmentStep({ t, input, schedule, money, locale }: ExplanationFacts) {
  const e = t.explanation;
  const { financed, interest, fees, total, instalments } = schedule;
  const first = instalments[0];
  const last = instalments.at(-1);
  const extras = [
    interest > 0 ? e.plusInterest(money(interest)) : null,
    fees > 0 ? e.plusFees(money(fees), input.count, money(input.monthlyFee)) : null,
  ].filter((part) => part !== null);
  return (
    <Step n={2} title={e.instalmentTitle}>
      <p className="mm-formula">
        {input.upfront > 0 && `${e.financedFormula(money(input.price), money(input.upfront))} `}
        <strong>{money(financed)}</strong> {input.upfront > 0 ? e.toSpread : e.toSpreadNoUpfront}
      </p>
      {extras.length > 0 && (
        <p className="mm-formula">
          {money(financed)} {extras.join(" ")} = <strong>{money(total)}</strong>
        </p>
      )}
      {first !== undefined && (
        <p className="mm-formula">
          {money(total)} ÷ {input.count} = <strong>{money(first)}</strong> {e.aMonth}
        </p>
      )}
      {last !== undefined && last !== first && <p className="mm-t-small mm-muted">{e.lastDiffers(money(last))}</p>}
      {input.annualRateBps > 0 && (
        <p className="mm-t-small mm-muted">{e.rateNote(formatPercent(input.annualRateBps, locale))}</p>
      )}
    </Step>
  );
}

/** Step 3: the plan months that count on a past month's higher spending instead of the average. */
function SeasonalStep({ t, summary, assessment, money, month }: ExplanationFacts) {
  const e = t.explanation;
  const usual = money(summary.avgSpending);
  const seasonal = assessment.months.filter((m) => m.spendingSource === "seasonal");
  return (
    <Step n={3} title={e.seasonalTitle}>
      <p className="mm-t-small mm-muted">{e.seasonalRule}</p>
      {seasonal.length === 0 ? (
        <p>{e.seasonalNone(usual)}</p>
      ) : (
        <>
          <dl className="mm-stats mm-stats--compact">
            {seasonal.map((m) => (
              <div className="mm-stat" key={m.month}>
                <dt>
                  {month(m.month)}
                  <span className="mm-stat__meta">{e.spentIn(month(m.seasonalMonth))}</span>
                </dt>
                <dd>{money(m.expectedSpending)}</dd>
              </div>
            ))}
          </dl>
          {seasonal.length < assessment.months.length && <p>{e.seasonalOthers(usual)}</p>}
        </>
      )}
    </Step>
  );
}

/** Step 4: the leftover sum for the deciding month, and where each status starts. */
function LeftoverStep({ t, summary, assessment, critical, money, month, locale }: ExplanationFacts) {
  const e = t.explanation;
  const { buffer } = assessment;
  const zero = money(toCents(0));
  return (
    <Step n={4} title={e.leftoverTitle}>
      <p className="mm-formula">{e.leftoverFormula}</p>
      <p className="mm-formula">
        {e.leftoverExample(
          month(critical.month),
          money(summary.avgIncome),
          money(critical.expectedSpending),
          money(critical.instalment),
        )}{" "}
        <strong className={critical.leftover < 0 ? "mm-neg" : undefined}>{money(critical.leftover)}</strong>
      </p>
      <p className="mm-t-small mm-muted">{e.criticalNote}</p>
      <ul className="mm-list">
        <li>
          <StatusChip status="fits" label={t.status.fits} small />
          <span className="mm-t-small mm-num">{e.fitsRange(money(buffer))}</span>
        </li>
        {/* With a zero buffer no month can be tight, and "€0.00 to −€0.01" would make no sense. */}
        {buffer > 0 && (
          <li>
            <StatusChip status="tight" label={t.status.tight} small />
            <span className="mm-t-small mm-num">{e.tightRange(zero, money(toCents(buffer - 1)))}</span>
          </li>
        )}
        <li>
          <StatusChip status="no-fit" label={t.status["no-fit"]} small />
          <span className="mm-t-small mm-num">{e.noFitRange(zero)}</span>
        </li>
      </ul>
      <p className="mm-t-small mm-muted">{e.bufferNote(money(buffer), formatPercent(BUFFER_BPS, locale))}</p>
    </Step>
  );
}
