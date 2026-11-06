import type { SummaryResult } from "@/lib/budget/summary";
import { periodOptions } from "@/lib/budget/summary";
import { PERIOD_OPTIONS } from "@/lib/constants";
import type { Locale, Messages } from "@/lib/i18n";
import { formatMonth, formatNumber } from "@/lib/i18n/format";
import { formatCents } from "@/lib/money/format";
import { ArrowRightIcon, InfoIcon, StatusIcon } from "./icons";

/** Category names shown under each group, so the group's total is recognisable. */
const CATEGORIES_SHOWN = 3;

/** Step 1: the averages the plan is checked against, and the period they cover. */
export function Summary({
  t,
  locale,
  result,
  rowCount,
  fullMonthCount,
  period,
  onPeriod,
  onContinue,
}: {
  t: Messages;
  locale: Locale;
  result: SummaryResult;
  rowCount: number;
  fullMonthCount: number;
  period: number;
  onPeriod: (months: number) => void;
  onContinue: () => void;
}) {
  const s = t.summary;
  if (!result.ok) {
    return <Unexpected t={t} />;
  }
  const summary = result.summary;
  const money = (value: Parameters<typeof formatCents>[0]) => formatCents(value, locale);
  const available = periodOptions(fullMonthCount);
  const first = summary.fullMonths[0]?.month;
  const last = summary.fullMonths.at(-1)?.month;

  return (
    <>
      <section className="mm-intro">
        <p className="mm-step">{s.step}</p>
        <h1 className="mm-t-h1" id="step-title" tabIndex={-1}>
          {s.title}
        </h1>
        {first !== undefined && last !== undefined && (
          <p className="mm-muted">
            {s.source(formatNumber(rowCount, locale), formatMonth(first, locale), formatMonth(last, locale))}
          </p>
        )}
      </section>

      <div className="mm-field">
        <span className="mm-label" id="period">
          {s.periodLabel}
        </span>
        <div className="mm-seg max-w-[480px]" role="group" aria-labelledby="period">
          {PERIOD_OPTIONS.map((months) => (
            <button
              key={months}
              type="button"
              className="mm-seg__opt"
              aria-pressed={months === period}
              disabled={!available.includes(months)}
              onClick={() => {
                onPeriod(months);
              }}
            >
              {s.periodOption(months)}
            </button>
          ))}
        </div>
        <p className="mm-hint">{s.periodHint}</p>
      </div>

      <section className="mm-card" aria-labelledby="income">
        <div className="mm-card__head">
          <h2 className="mm-t-h2" id="income">
            {s.incomeTitle}
          </h2>
          <span className="mm-t-small mm-muted">{s.monthlyAverage}</span>
        </div>
        <dl className="mm-stats">
          <div className="mm-stat">
            <dt>{s.incomeTotal}</dt>
            <dd>{money(summary.avgIncome)}</dd>
          </div>
        </dl>
      </section>

      <section className="mm-card" aria-labelledby="spending">
        <div className="mm-card__head">
          <h2 className="mm-t-h2" id="spending">
            {s.spendingTitle}
          </h2>
          <span className="mm-t-small mm-muted">{s.monthlyAverage}</span>
        </div>
        <dl className="mm-stats">
          {summary.byGroup.map((group) => (
            <div className="mm-stat" key={group.group}>
              <dt>
                {group.group}
                <span className="mm-stat__meta">
                  {group.categories
                    .slice(0, CATEGORIES_SHOWN)
                    .map((c) => c.category)
                    .join(", ")}
                </span>
              </dt>
              <dd>{money(group.avg)}</dd>
            </div>
          ))}
          <div className="mm-stat mm-stat--total">
            <dt>{s.spendingTotal}</dt>
            <dd>{money(summary.avgSpending)}</dd>
          </div>
        </dl>
      </section>

      <section className="mm-card border-transparent bg-(--mm-accent-subtle)" aria-labelledby="margin">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="mm-t-h2" id="margin">
            {s.marginTitle}
          </h2>
          <p className="mm-t-figure mm-num whitespace-nowrap">{money(summary.margin)}</p>
        </div>
        <p className="mm-t-small mm-muted -mt-2">
          {s.marginExplain(money(summary.avgIncome), money(summary.avgSpending))}
        </p>
      </section>

      {summary.margin <= 0 && (
        <div className="mm-callout mm-callout--warn">
          <StatusIcon status="tight" className="mm-ico mm-callout__icon" />
          <div className="mm-callout__content">
            <p className="mm-callout__title">{s.noMarginTitle}</p>
            <p>{s.noMarginBody}</p>
          </div>
        </div>
      )}

      <div className="mm-actions">
        <button type="button" className="mm-btn mm-btn--primary" onClick={onContinue}>
          {s.continue}
          <ArrowRightIcon />
        </button>
      </div>
    </>
  );
}

/** Shown when numbers that passed every check still can't be used. */
export function Unexpected({ t }: { t: Messages }) {
  return (
    <div className="mm-callout mm-callout--error" role="alert">
      <InfoIcon className="mm-ico mm-callout__icon" />
      <p className="mm-callout__content" id="step-title" tabIndex={-1}>
        {t.unexpected}
      </p>
    </div>
  );
}
