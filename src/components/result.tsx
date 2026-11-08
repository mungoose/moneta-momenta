import type { DataSummary } from "@/lib/budget/summary";
import type { Locale, Messages } from "@/lib/i18n";
import { formatMonth, formatOfMonth, formatPercent } from "@/lib/i18n/format";
import { sum, toCents, type Cents } from "@/lib/money/cents";
import { formatCents } from "@/lib/money/format";
import { largestFittingPayment, type Affordability, type PlanMonth, type Status } from "@/lib/plan/affordability";
import type { PlanInput, Schedule } from "@/lib/plan/schedule";
import { Explanation, StatusRules } from "./explanation";
import { StatusChip, StatusIcon } from "./icons";

const VERDICT_CLASS: Record<Status, string> = {
  fits: "mm-verdict--fits",
  tight: "mm-verdict--tight",
  "no-fit": "mm-verdict--nofit",
};

const SEVERITY: Record<Status, number> = { fits: 0, tight: 1, "no-fit": 2 };

/**
 * The month that decides the verdict: the worst status, and within it the
 * least left over. Status comes first because a covered month can be further
 * below zero than one that doesn't fit.
 */
function criticalMonth(months: readonly PlanMonth[]): PlanMonth | undefined {
  return months.reduce<PlanMonth | undefined>((worst, m) => {
    if (worst === undefined) {
      return m;
    }
    const bySeverity = SEVERITY[m.status] - SEVERITY[worst.status];
    return bySeverity > 0 || (bySeverity === 0 && m.leftover < worst.leftover) ? m : worst;
  }, undefined);
}

/** Formats money and months for one locale, so the verdict helpers don't each need the locale. */
interface Formatters {
  money: (value: Cents) => string;
  month: (value: string) => string;
  /** A month as "of <month>" (Estonian genitive), for copy that inflects it. */
  monthOf: (value: string) => string;
}

/** How many plan months have each status. */
type StatusCounts = Record<Status, number>;

/** What the verdict text is built from. */
interface VerdictFacts {
  assessment: Affordability;
  counts: StatusCounts;
  /** The month that decides the verdict: the worst status, then the least left over. */
  critical: PlanMonth;
  /**
   * The usual margin is below the buffer. Every plan month's margin is at most
   * the usual one, so no month can fit, whatever the terms: the verdict says
   * that first, or the user would keep trying other terms.
   */
  noRoom: boolean;
  /** The usual margin (for the no-room headline) and usual spending (for the seasonal line). */
  summary: Pick<DataSummary, "margin" | "avgSpending">;
}

/**
 * The verdict headline. With no room above the buffer, it says so: no terms
 * can help. Otherwise a single tight or failing month is named; several are
 * counted, and a failing plan also says how short the worst month is. A tight
 * plan whose deciding month is short says how much it needs: from savings when
 * earlier months cover it, or as the one month that comes up short.
 */
function verdictTitle(r: Messages["result"], facts: VerdictFacts, { money, month, monthOf }: Formatters): string {
  const { assessment, counts, critical } = facts;
  const { verdict } = assessment;
  if (verdict === "fits") {
    return r.verdictFits;
  }
  if (facts.noRoom) {
    return r.verdictNoRoom(money(facts.summary.margin), money(assessment.buffer));
  }
  const worst = month(critical.month);
  // `0 - x`, not `-x`: unary minus on the branded type isn't type-safe, and it would turn 0 into −0.
  const short = money(toCents(0 - critical.leftover));
  if (verdict === "tight") {
    if (critical.status === "no-fit") {
      return r.verdictOneShort(worst, short);
    }
    if (counts.tight === 1) {
      return critical.covered ? r.verdictCovered(worst, short) : r.verdictTightOne(worst);
    }
    return r.verdictTightMany(counts.tight);
  }
  return counts["no-fit"] === 1
    ? r.verdictNoFitOne(worst, short)
    : r.verdictNoFitMany(counts["no-fit"], monthOf(critical.month), short);
}

/**
 * The lines under the headline. A fitting plan gets one line on the buffer and
 * its closest month. Otherwise: why no terms fit (with no room), how many
 * months fit (when any do), the deciding month's sum, why that month's
 * spending is higher (when it is seasonal), and, when the plan is only tight,
 * why: the buffer rule, the savings that cover a short month, or the one short
 * month among fitting ones. Last, the largest payment that would fit every
 * month, when there is one.
 */
function verdictReasons(r: Messages["result"], facts: VerdictFacts, { money, month, monthOf }: Formatters): string[] {
  const { assessment, counts, critical } = facts;
  const { verdict, buffer, months } = assessment;
  if (verdict === "fits") {
    return [r.fitsBody(money(buffer), month(critical.month), money(critical.leftover))];
  }
  const lines = [
    ...(facts.noRoom ? [r.noRoomBody] : []),
    // "Fits in 0 of 12 months" reads as a riddle when the counts below already say it.
    ...(counts.fits > 0 ? [r.fitShare(counts.fits, months.length)] : []),
    r.monthSum(month(critical.month), money(critical.margin), money(critical.instalment), money(critical.leftover)),
  ];
  if (critical.spendingSource === "seasonal") {
    lines.push(
      r.seasonal(
        monthOf(critical.seasonalMonth),
        money(critical.expectedSpending),
        money(facts.summary.avgSpending),
        monthOf(critical.month),
      ),
    );
  }
  if (verdict === "tight") {
    if (critical.status === "no-fit") {
      lines.push(r.oneShortBody);
    } else if (critical.covered) {
      lines.push(r.coveredBody(money(critical.savedBefore), money(buffer)));
    } else {
      lines.push(r.belowBuffer(money(buffer)));
    }
  }
  const payment = largestFittingPayment(assessment);
  if (payment !== null) {
    lines.push(r.fittingPayment(money(payment)));
  }
  return lines;
}

/** Step 3: the verdict, what the plan costs, and every month with its numbers. */
export function Result({
  t,
  locale,
  summary,
  input,
  schedule,
  assessment,
  onChange,
  onBack,
  onExplain,
}: {
  t: Messages;
  locale: Locale;
  summary: DataSummary;
  input: PlanInput;
  schedule: Schedule;
  assessment: Affordability;
  onChange: () => void;
  onBack: () => void;
  /** The user opened "How we calculated this". */
  onExplain: () => void;
}) {
  const r = t.result;
  const format: Formatters = {
    money: (value) => formatCents(value, locale),
    month: (value) => formatMonth(value, locale),
    monthOf: (value) => formatOfMonth(value, locale),
  };
  const { money, month } = format;
  const { months, verdict, buffer } = assessment;
  const critical = criticalMonth(months);
  const first = months[0];
  const last = months.at(-1);
  const payment = schedule.instalments[0];
  if (critical === undefined || first === undefined || last === undefined || payment === undefined) {
    return null;
  }
  const count = (status: Status) => months.filter((m) => m.status === status).length;
  const counts: StatusCounts = { fits: count("fits"), tight: count("tight"), "no-fit": count("no-fit") };

  const terms = [
    input.upfront > 0 ? r.termsUpfront(money(input.upfront)) : null,
    // Said either way: a missing rate would leave the user unsure whether interest was counted.
    input.annualRateBps > 0 ? r.termsRate(formatPercent(input.annualRateBps, locale)) : r.termsInterestFree,
    input.monthlyFee > 0 ? r.termsFee(money(input.monthlyFee)) : null,
    r.termsMonths(month(first.month), month(last.month)),
  ].filter((part) => part !== null);

  const facts: VerdictFacts = { assessment, counts, critical, noRoom: summary.margin < buffer, summary };
  const title = verdictTitle(r, facts, format);
  const why = verdictReasons(r, facts, format);

  return (
    <>
      <section className="mm-intro">
        <p className="mm-step">{r.step}</p>
        <h1 className="mm-t-h1" id="step-title" tabIndex={-1}>
          {r.title(money(input.price), input.count)}
        </h1>
        <p className="mm-muted mm-num">{terms.join(" · ")}</p>
        {summary.incomplete.length > 0 && (
          <p className="mm-t-small mm-muted flex items-start gap-2">
            <StatusIcon status="tight" className="mm-ico mm-ico--sm mt-0.5 shrink-0 text-(--mm-tight)" />
            {r.incomplete}
          </p>
        )}
      </section>

      <section className={`mm-verdict ${VERDICT_CLASS[verdict]}`} aria-labelledby="verdict">
        <div className="mm-verdict__head">
          <StatusChip status={verdict} label={t.status[verdict]} />
          <h2 className="mm-verdict__title" id="verdict">
            {title}
          </h2>
          {why.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
        <div className="mm-verdict__body">
          <dl className="mm-stats">
            <div className="mm-stat">
              <dt>
                {r.payment}
                {input.monthlyFee > 0 && (
                  <span className="mm-stat__meta">{t.purchase.paymentFee(money(input.monthlyFee))}</span>
                )}
              </dt>
              <dd>{money(payment)}</dd>
            </div>
            <div className="mm-stat">
              <dt>{r.months}</dt>
              <dd className="font-medium">{r.monthsValue(counts.fits, counts.tight, counts["no-fit"])}</dd>
            </div>
            <div className="mm-stat">
              <dt>
                {r.totalPaid}
                <span className="mm-stat__meta">{r.totalPaidMeta(money(input.upfront), money(schedule.total))}</span>
              </dt>
              <dd>{money(sum([input.upfront, schedule.total]))}</dd>
            </div>
            <div className="mm-stat">
              <dt>
                {r.creditCost}
                <span className="mm-stat__meta">
                  {r.creditCostMeta(money(schedule.interest), money(schedule.fees))}
                </span>
              </dt>
              <dd>{money(sum([schedule.interest, schedule.fees]))}</dd>
            </div>
          </dl>
        </div>
        <div className="mm-verdict__foot">
          <Explanation
            t={t}
            locale={locale}
            summary={summary}
            input={input}
            schedule={schedule}
            assessment={assessment}
            critical={critical}
            onOpen={onExplain}
          />
          <button type="button" className="mm-btn mm-btn--secondary" onClick={onChange}>
            {r.change}
          </button>
        </div>
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="months">
        <div className="mm-intro gap-1.5">
          <h2 className="mm-t-h2" id="months">
            {r.monthsTitle}
          </h2>
          <p className="mm-t-small mm-muted">{r.monthsIntro(money(buffer))}</p>
          <StatusRules t={t} buffer={buffer} locale={locale} />
        </div>
        <div className="mm-tablebox">
          <table className="mm-months" aria-labelledby="months">
            <thead>
              <tr>
                <th scope="col">{r.colMonth}</th>
                <th scope="col" className="num">
                  {r.colMargin}
                </th>
                <th scope="col" className="num">
                  {r.colInstalment}
                </th>
                <th scope="col" className="num">
                  {r.colLeft}
                </th>
                <th scope="col" className="c-status">
                  {r.colStatus}
                </th>
              </tr>
            </thead>
            <tbody>
              {months.map((m) => (
                <MonthRow key={m.month} t={t} locale={locale} month={m} />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="mm-actions">
        <button type="button" className="mm-btn mm-btn--primary" onClick={onChange}>
          {r.change}
        </button>
        <button type="button" className="mm-btn mm-btn--secondary" onClick={onBack}>
          {r.backToMoney}
        </button>
      </div>
    </>
  );
}

/**
 * One plan month. On a wide screen: month, margin, instalment, left over,
 * status. On a narrow one the design's CSS turns it into two lines: month and
 * status, then margin − instalment and what's left.
 */
function MonthRow({ t, locale, month: m }: { t: Messages; locale: Locale; month: PlanMonth }) {
  const r = t.result;
  const money = (value: Cents) => formatCents(value, locale);
  const margin = (
    <span>
      <span className="mm-phone">{r.phoneMargin} </span>
      {money(m.margin)}
      <span className="mm-phone"> − {money(m.instalment)}</span>
    </span>
  );
  return (
    <tr className={m.status === "no-fit" ? "is-nofit" : undefined}>
      <td className="c-month">{formatMonth(m.month, locale, "short")}</td>
      <td className="c-irr num">
        {m.spendingSource === "seasonal" ? (
          <span className="mm-irr">
            <span className="mm-irr__name">{r.basedOn(formatMonth(m.seasonalMonth, locale, "short"))}</span>
            {margin}
          </span>
        ) : (
          margin
        )}
      </td>
      <td className="c-inst num">{money(toCents(0 - m.instalment))}</td>
      <td className={`c-left num${m.leftover < 0 ? " mm-neg" : ""}`}>
        <span className="mm-phone">{r.phoneLeft} </span>
        {money(m.leftover)}
      </td>
      <td className="c-status">
        {m.covered ? (
          <span className="mm-irr">
            <StatusChip status={m.status} label={t.status[m.status]} small />
            <span className="mm-irr__name">{r.fromSavings}</span>
          </span>
        ) : (
          <StatusChip status={m.status} label={t.status[m.status]} small />
        )}
      </td>
    </tr>
  );
}
