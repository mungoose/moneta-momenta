import type { YearMonth } from "@/lib/budget/months";
import type { DataSummary, SummaryResult } from "@/lib/budget/summary";
import { periodOptions } from "@/lib/budget/summary";
import { PERIOD_OPTIONS } from "@/lib/constants";
import type { Locale, Messages } from "@/lib/i18n";
import { formatDay, formatList, formatMonth, formatNumber } from "@/lib/i18n/format";
import { outdatedEnd } from "@/lib/load";
import { formatCents } from "@/lib/money/format";
import type { DataSource } from "./flow-state";
import { ArrowRightIcon, InfoIcon, StatusIcon } from "./icons";

/** Category names shown under each group, so the group's total is recognisable. */
const CATEGORIES_SHOWN = 3;

/** Step 1: the averages the plan is checked against, and the period they cover. */
export function Summary({
  t,
  locale,
  result,
  source,
  reference,
  rowCount,
  fullMonthCount,
  period,
  onPeriod,
  onContinue,
}: {
  t: Messages;
  locale: Locale;
  result: SummaryResult;
  source: DataSource;
  reference: YearMonth;
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
          <p className="mm-muted break-words">
            {source.kind === "sample"
              ? s.source(formatNumber(rowCount, locale), formatMonth(first, locale), formatMonth(last, locale))
              : s.sourceUpload(
                  source.name,
                  formatNumber(rowCount, locale),
                  formatMonth(first, locale),
                  formatMonth(last, locale),
                )}
          </p>
        )}
      </section>

      {dataWarnings(t, locale, summary, reference).map(({ title, body }) => (
        <Warning key={title} title={title} body={body} />
      ))}

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

      {summary.margin <= 0 && <Warning title={s.noMarginTitle} body={s.noMarginBody} />}

      <div className="mm-actions">
        <button type="button" className="mm-btn mm-btn--primary" onClick={onContinue}>
          {s.continue}
          <ArrowRightIcon />
        </button>
      </div>
    </>
  );
}

/**
 * What may make the averages wrong, in the order the user should read it:
 * missing transactions at the file's edges, missing recent months, months
 * without income. Warnings, not errors: only the user knows if the data is right.
 */
function dataWarnings(
  t: Messages,
  locale: Locale,
  summary: DataSummary,
  reference: YearMonth,
): { title: string; body: string }[] {
  const s = t.summary;
  const warnings = summary.incomplete.map((edge) => ({
    title:
      edge.why === "starts-mid-month"
        ? s.startsLateTitle(formatDay(edge.firstDate, locale))
        : s.endsEarlyTitle(formatDay(edge.lastDate, locale)),
    body: s.incompleteBody(formatMonth(edge.month, locale)),
  }));
  const last = summary.fullMonths.at(-1)?.month;
  const outdated = last === undefined ? null : outdatedEnd(last, reference);
  if (outdated !== null) {
    warnings.push({ title: s.outdatedTitle(formatMonth(outdated, locale)), body: s.outdatedBody });
  }
  if (summary.noIncomeMonths.length > 0) {
    const months = formatList(
      summary.noIncomeMonths.map((m) => formatMonth(m, locale)),
      locale,
    );
    warnings.push({ title: s.noIncomeMonthsTitle(months), body: s.noIncomeMonthsBody });
  }
  return warnings;
}

/** A yellow callout: something to check, not something that stops the flow. */
function Warning({ title, body }: { title: string; body: string }) {
  return (
    <div className="mm-callout mm-callout--warn">
      <StatusIcon status="tight" className="mm-ico mm-callout__icon" />
      <div className="mm-callout__content">
        <p className="mm-callout__title">{title}</p>
        <p>{body}</p>
      </div>
    </div>
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
