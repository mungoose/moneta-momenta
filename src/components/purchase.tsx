import { useEffect, useRef } from "react";
import { addMonths, type YearMonth } from "@/lib/budget/months";
import {
  INSTALMENT_PRESETS,
  MAX_INSTALMENTS,
  MAX_MONTHLY_FEE_CENTS,
  MAX_PRICE_CENTS,
  MIN_INSTALMENTS,
} from "@/lib/constants";
import type { Locale, Messages } from "@/lib/i18n";
import { formatMonth } from "@/lib/i18n/format";
import { toCents } from "@/lib/money/cents";
import { formatCents } from "@/lib/money/format";
import type { PlanForm, PlanFormError, PlanFormResult } from "@/lib/plan/form";
import type { PlanInput } from "@/lib/plan/schedule";
import { ArrowRightIcon, StatusIcon } from "./icons";

/** The input element each plan field's error belongs to. */
const FIELD_ID: Record<keyof PlanInput, string> = {
  price: "price",
  upfront: "upfront",
  count: "count",
  annualRateBps: "rate",
  monthlyFee: "fee",
};

/**
 * The message for one field error, in the UI language. A field's own message
 * for the code if it has one, else the field's "can't read this" message.
 * Upfront has no too-low message: the input takes no sign.
 */
function errorMessage(t: Messages, locale: Locale, { field, code }: PlanFormError): string {
  const e = t.purchase.errors;
  const money = (cents: number) => formatCents(toCents(cents), locale);
  const specific: Partial<Record<`${keyof PlanInput}:${PlanFormError["code"]}`, () => string>> = {
    "price:required": () => e.requiredPrice,
    "price:too-low": () => e.priceLow,
    "price:too-high": () => e.priceHigh(money(MAX_PRICE_CENTS)),
    "upfront:too-high": () => e.upfrontHigh,
    "count:required": () => e.requiredCount,
    "count:too-low": () => e.countLow(MIN_INSTALMENTS),
    "count:too-high": () => e.countHigh(MAX_INSTALMENTS),
    "annualRateBps:too-high": () => e.rateHigh,
    "monthlyFee:too-high": () => e.feeHigh(money(MAX_MONTHLY_FEE_CENTS)),
  };
  const unreadable: Record<keyof PlanInput, string> = {
    price: e.money,
    upfront: e.money,
    count: e.count,
    annualRateBps: e.rate,
    monthlyFee: e.money,
  };
  return specific[`${field}:${code}`]?.() ?? unreadable[field];
}

/** Step 2: the purchase form, with the payment it implies shown as the user types. */
export function Purchase({
  t,
  locale,
  form,
  plan,
  customCount,
  showErrors,
  failedSubmits,
  reference,
  onEdit,
  onCount,
  onSubmit,
  onBack,
}: {
  t: Messages;
  locale: Locale;
  form: PlanForm;
  plan: PlanFormResult;
  customCount: boolean;
  showErrors: boolean;
  failedSubmits: number;
  reference: YearMonth;
  onEdit: (field: keyof PlanForm, value: string) => void;
  onCount: (count: number | "custom") => void;
  onSubmit: () => void;
  onBack: () => void;
}) {
  const p = t.purchase;
  const money = (value: Parameters<typeof formatCents>[0]) => formatCents(value, locale);
  const errors = showErrors && !plan.ok ? plan.errors : [];
  const errorFor = (field: keyof PlanInput) => {
    const error = errors.find((e) => e.field === field);
    return error && errorMessage(t, locale, error);
  };

  // After a submit with errors, move focus to the first field to fix.
  const formRef = useRef<HTMLFormElement>(null);
  const firstError = errors[0]?.field;
  useEffect(() => {
    if (failedSubmits > 0 && firstError !== undefined) {
      formRef.current?.querySelector<HTMLInputElement>(`#${FIELD_ID[firstError]}`)?.focus();
    }
    // Only on a new failed submit, not on every keystroke while errors show.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [failedSubmits]);

  const presetPressed = (count: number) => !customCount && form.count === String(count);

  return (
    <>
      <section className="mm-intro">
        <p className="mm-step">{p.step}</p>
        <h1 className="mm-t-h1" id="step-title" tabIndex={-1}>
          {p.title}
        </h1>
        <p className="mm-muted">{p.intro}</p>
        <p className="mm-hint">{t.scope}</p>
      </section>

      <form
        ref={formRef}
        noValidate
        className="contents"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <div className="mm-card gap-7">
          <MoneyField
            id="price"
            label={p.price}
            value={form.price}
            error={errorFor("price")}
            onChange={(value) => {
              onEdit("price", value);
            }}
          />
          <MoneyField
            id="upfront"
            label={p.upfront}
            hint={p.upfrontHint}
            value={form.upfront}
            error={errorFor("upfront")}
            onChange={(value) => {
              onEdit("upfront", value);
            }}
          />

          <div className="mm-field">
            <span className="mm-label" id="count-label">
              {p.count}
            </span>
            <div className="mm-seg" role="group" aria-labelledby="count-label">
              {INSTALMENT_PRESETS.map((count) => (
                <button
                  key={count}
                  type="button"
                  className="mm-seg__opt"
                  aria-pressed={presetPressed(count)}
                  onClick={() => {
                    onCount(count);
                  }}
                >
                  {count}
                </button>
              ))}
              <button
                type="button"
                className="mm-seg__opt"
                aria-pressed={customCount}
                onClick={() => {
                  onCount("custom");
                }}
              >
                {p.custom}
              </button>
            </div>
            <p className="mm-hint" id="count-hint">
              {p.countHint(MIN_INSTALMENTS, MAX_INSTALMENTS)}
            </p>
            {customCount && (
              <TextField
                id="count"
                label={p.customLabel}
                inputMode="numeric"
                value={form.count}
                error={errorFor("count")}
                onChange={(value) => {
                  onEdit("count", value);
                }}
                boxClassName="max-w-[240px]"
              />
            )}
          </div>

          <div className="mm-row2">
            <TextField
              id="rate"
              label={p.rate}
              hint={p.rateHint}
              suffix={p.rateUnit}
              inputMode="decimal"
              value={form.rate}
              error={errorFor("annualRateBps")}
              onChange={(value) => {
                onEdit("rate", value);
              }}
            />
            <MoneyField
              id="fee"
              label={p.fee}
              hint={p.feeHint}
              value={form.fee}
              error={errorFor("monthlyFee")}
              onChange={(value) => {
                onEdit("fee", value);
              }}
            />
          </div>

          {plan.ok && (
            <div className="border-t border-mm-border pt-2">
              <dl className="mm-stats" aria-live="polite">
                <div className="mm-stat">
                  <dt>
                    {p.spread}
                    <span className="mm-stat__meta">
                      {p.spreadMeta(money(plan.input.price), money(plan.input.upfront))}
                    </span>
                  </dt>
                  <dd>{money(plan.schedule.financed)}</dd>
                </div>
                <div className="mm-stat">
                  <dt>{p.firstInstalment}</dt>
                  <dd className="font-medium">{formatMonth(addMonths(reference, 1), locale)}</dd>
                </div>
                <PaymentStat t={t} locale={locale} plan={plan} />
              </dl>
            </div>
          )}
        </div>

        <div className="mm-actions">
          <button type="submit" className="mm-btn mm-btn--primary">
            {p.submit}
            <ArrowRightIcon />
          </button>
          <button type="button" className="mm-btn mm-btn--secondary" onClick={onBack}>
            {p.back}
          </button>
        </div>
      </form>
    </>
  );
}

/** The monthly payment, with what's in it and how the last one differs. */
function PaymentStat({ t, locale, plan }: { t: Messages; locale: Locale; plan: PlanFormResult & { ok: true } }) {
  const p = t.purchase;
  const { instalments } = plan.schedule;
  const first = instalments[0];
  const last = instalments.at(-1);
  if (first === undefined || last === undefined) {
    return null;
  }
  const meta = [
    plan.input.monthlyFee > 0 ? p.paymentFee(formatCents(plan.input.monthlyFee, locale)) : null,
    last === first ? null : p.paymentLast(formatCents(last, locale)),
  ].filter((part) => part !== null);
  return (
    <div className="mm-stat mm-stat--hero">
      <dt>
        {p.payment}
        {meta.length > 0 && <span className="mm-stat__meta">{meta.join(". ")}</span>}
      </dt>
      <dd>{formatCents(first, locale)}</dd>
    </div>
  );
}

interface FieldProps {
  id: string;
  label: string;
  hint?: string;
  value: string;
  error: string | undefined;
  onChange: (value: string) => void;
}

/** A euro amount field. */
function MoneyField(props: FieldProps) {
  return <TextField {...props} prefix="€" inputMode="decimal" />;
}

/** A labelled text field in the design's input style, with an optional hint, affixes and error. */
function TextField({
  id,
  label,
  hint,
  value,
  error,
  onChange,
  prefix,
  suffix,
  inputMode,
  boxClassName,
}: FieldProps & {
  prefix?: string;
  suffix?: string;
  inputMode: "decimal" | "numeric";
  /** Classes for the input box only, so a narrow box keeps its hint and error at full width. */
  boxClassName?: string;
}) {
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(" ") || undefined;
  return (
    <div className="mm-field">
      <label className="mm-label" htmlFor={id}>
        {label}
      </label>
      <div className={`mm-money${error ? " is-error" : ""} ${boxClassName ?? ""}`}>
        {prefix && (
          <span className="mm-money__affix" aria-hidden="true">
            {prefix}
          </span>
        )}
        <input
          id={id}
          className="mm-money__input"
          inputMode={inputMode}
          autoComplete="off"
          value={value}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onChange={(event) => {
            onChange(event.target.value);
          }}
        />
        {suffix && <span className="mm-money__affix">{suffix}</span>}
      </div>
      <FieldNotes id={id} hint={hint} error={error} />
    </div>
  );
}

/** A field's hint and error lines, with the ids its input refers to. */
function FieldNotes({ id, hint, error }: { id: string; hint?: string; error: string | undefined }) {
  return (
    <>
      {hint && (
        <p className="mm-hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
      {error && (
        <p className="mm-error" id={`${id}-error`}>
          <StatusIcon status="no-fit" className="mm-ico mm-ico--sm" />
          {error}
        </p>
      )}
    </>
  );
}
