import type { DataSummary } from "@/lib/budget/summary";
import type { Locale, Messages } from "@/lib/i18n";
import { formatMonth, formatPercent } from "@/lib/i18n/format";
import { sum, toCents, type Cents } from "@/lib/money/cents";
import { formatCents } from "@/lib/money/format";
import type { Affordability, PlanMonth, Status } from "@/lib/plan/affordability";
import type { PlanInput, Schedule } from "@/lib/plan/schedule";
import { StatusChip, StatusIcon } from "./icons";

const VERDICT_CLASS: Record<Status, string> = {
  fits: "mm-verdict--fits",
  tight: "mm-verdict--tight",
  "no-fit": "mm-verdict--nofit",
};

/** The month with the least left over: the one that decides the verdict. */
function closestMonth(months: readonly PlanMonth[]): PlanMonth | undefined {
  return months.reduce<PlanMonth | undefined>(
    (worst, m) => (worst && worst.leftover <= m.leftover ? worst : m),
    undefined,
  );
}

/** Formats money and months for one locale, so the verdict helpers don't each need the locale. */
interface Formatters {
  money: (value: Cents) => string;
  month: (value: string) => string;
}

/** How many plan months have each status. */
type StatusCounts = Record<Status, number>;

/** What the verdict text is built from. */
interface VerdictFacts {
  assessment: Affordability;
  counts: StatusCounts;
  /** The month with the least left over. */
  critical: PlanMonth;
}

/**
 * The verdict headline. A single tight or failing month is named; several are
 * counted, and a failing plan also says how short the worst month is.
 */
function verdictTitle(r: Messages["result"], facts: VerdictFacts, { money, month }: Formatters): string {
  const { assessment, counts, critical } = facts;
  const { verdict } = assessment;
  if (verdict === "fits") {
    return r.verdictFits;
  }
  const worst = month(critical.month);
  if (verdict === "tight") {
    return counts.tight === 1 ? r.verdictTightOne(worst) : r.verdictTightMany(counts.tight);
  }
  // `0 - x`, not `-x`: unary minus on the branded type isn't type-safe, and it would turn 0 into −0.
  const short = money(toCents(0 - critical.leftover));
  return counts["no-fit"] === 1 ? r.verdictNoFitOne(worst, short) : r.verdictNoFitMany(counts["no-fit"], worst, short);
}

/**
 * The lines under the headline. A fitting plan gets one line on the buffer and
 * its closest month. Otherwise: how many months fit, the worst month's sum,
 * why that month's spending is higher (when it is seasonal), and the buffer
 * rule when the plan is only tight.
 */
function verdictReasons(
  r: Messages["result"],
  facts: VerdictFacts,
  avgSpending: Cents,
  { money, month }: Formatters,
): string[] {
  const { assessment, counts, critical } = facts;
  const { verdict, buffer, months } = assessment;
  if (verdict === "fits") {
    return [r.fitsBody(money(buffer), month(critical.month), money(critical.leftover))];
  }
  const lines = [
    r.fitShare(counts.fits, months.length),
    r.monthSum(month(critical.month), money(critical.margin), money(critical.instalment), money(critical.leftover)),
  ];
  if (critical.spendingSource === "seasonal") {
    lines.push(
      r.seasonal(
        month(critical.seasonalMonth),
        money(critical.expectedSpending),
        money(avgSpending),
        month(critical.month),
      ),
    );
  }
  if (verdict === "tight") {
    lines.push(r.belowBuffer(money(buffer)));
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
}: {
  t: Messages;
  locale: Locale;
  summary: DataSummary;
  input: PlanInput;
  schedule: Schedule;
  assessment: Affordability;
  onChange: () => void;
  onBack: () => void;
}) {
  const r = t.result;
  const format: Formatters = {
    money: (value) => formatCents(value, locale),
    month: (value) => formatMonth(value, locale),
  };
  const { money, month } = format;
  const { months, verdict, buffer } = assessment;
  const critical = closestMonth(months);
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
    input.annualRateBps > 0 ? r.termsRate(formatPercent(input.annualRateBps, locale)) : null,
    input.monthlyFee > 0 ? r.termsFee(money(input.monthlyFee)) : null,
    r.termsMonths(month(first.month), month(last.month)),
  ].filter((part) => part !== null);

  const facts: VerdictFacts = { assessment, counts, critical };
  const title = verdictTitle(r, facts, format);
  const why = verdictReasons(r, facts, summary.avgSpending, format);

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
          {r.tryAgain}
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
        <StatusChip status={m.status} label={t.status[m.status]} small />
      </td>
    </tr>
  );
}
