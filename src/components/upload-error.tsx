import { useEffect, useRef } from "react";
import { MAX_FILE_MB, MIN_FULL_MONTHS } from "@/lib/constants";
import type { Locale, Messages } from "@/lib/i18n";
import { formatList, formatMonth, formatNumber } from "@/lib/i18n/format";
import { REQUIRED_COLUMNS, type RequiredColumn } from "@/lib/import/format-spec";
import type { ImportError } from "@/lib/import/types";
import type { LoadError } from "@/lib/load";
import type { Loading, UploadError } from "./flow-state";
import { FileIcon, StatusIcon } from "./icons";
import { LoadingStatus, UploadButton } from "./landing";

/** Where the error screen's template link points; the file lives in `public/`. */
const TEMPLATE_PATH = "/transactions-template.csv";

/** What the error screen says: the problem, then the steps to fix it. */
interface Explanation {
  title: string;
  body: string[];
  fix: string[];
}

/** Turns a load error into the screen's copy, with the file's own values filled in. */
function explain(t: Messages, error: LoadError | null, file: string, locale: Locale): Explanation {
  const u = t.uploadError;
  if (error === null) {
    return { title: u.unexpected.title, body: [u.unexpected.body(file)], fix: u.unexpected.fix };
  }
  if (error.code === "too-little-data") {
    const dropped = error.droppedMonths.map((m) => formatMonth(m.month, locale));
    return {
      title: u.tooLittleData.title(error.fullMonths, MIN_FULL_MONTHS),
      body: [
        u.tooLittleData.body,
        ...(dropped.length > 0 ? [u.tooLittleData.leftOut(formatList(dropped, locale))] : []),
      ],
      fix: u.tooLittleData.fix,
    };
  }
  if (error.code === "no-income") {
    return { title: u.noIncome.title, body: [u.noIncome.body], fix: u.noIncome.fix };
  }
  return explainRead(t, error, file, locale);
}

/** The copy for a file that couldn't be read or parsed. */
function explainRead(t: Messages, error: ImportError, file: string, locale: Locale): Explanation {
  const u = t.uploadError;
  const line = (n: number) => formatNumber(n, locale);
  switch (error.code) {
    case "too-large":
      return { title: u.tooLarge.title, body: [u.tooLarge.body(file, `${MAX_FILE_MB} MB`)], fix: u.tooLarge.fix };
    case "not-text":
      return { title: u.notText.title, body: [u.notText.body(file)], fix: u.notText.fix };
    case "empty":
      return { title: u.empty.title, body: [u.empty.body(file)], fix: u.empty.fix };
    case "missing-columns":
      return {
        title: u.missingColumns.title,
        body: [
          u.missingColumns.body(
            file,
            formatList(error.missing, locale),
            error.missing.length,
            formatList(REQUIRED_COLUMNS, locale),
          ),
        ],
        fix: u.missingColumns.fix,
      };
    case "malformed":
      return { title: u.malformed.title(line(error.line)), body: [u.malformed.body], fix: u.malformed.fix };
    case "bad-date":
      return { title: u.badDate.title(line(error.line)), body: [u.badDate.body(error.value)], fix: u.badDate.fix };
    case "bad-amount":
      return {
        title: u.badAmount.title(line(error.line)),
        body: [u.badAmount.body(error.value, error.column)],
        fix: u.badAmount.fix,
      };
  }
}

/**
 * Shown on the landing step when an upload can't be used: what's wrong, how
 * to fix it, and the ways on. It isn't a step of its own, so it adds no
 * history entry.
 */
export function UploadErrorView({
  t,
  locale,
  failure,
  loading,
  onSample,
  onUpload,
}: {
  t: Messages;
  locale: Locale;
  failure: UploadError;
  loading: Loading | null;
  onSample: () => void;
  onUpload: (file: File) => void;
}) {
  const u = t.uploadError;
  const { error, fileName } = failure;
  const heading = useRef<HTMLHeadingElement>(null);
  // A new screen without a step change: move focus here, as a step change would.
  useEffect(() => {
    window.scrollTo(0, 0);
    heading.current?.focus();
  }, [failure]);

  const { title, body, fix } = explain(t, error, fileName, locale);
  // The file was read, but its data can't be used: a template wouldn't help.
  const unusable = error?.code === "too-little-data" || error?.code === "no-income";
  return (
    <>
      <section className="mm-intro">
        <p className="mm-step">{u.step}</p>
        <h1 className="mm-t-h1" id="step-title" tabIndex={-1} ref={heading}>
          {unusable ? u.useTitle : u.readTitle}
        </h1>
      </section>

      <div className="mm-callout mm-callout--error" role="alert">
        <StatusIcon status="no-fit" className="mm-ico mm-callout__icon" />
        <div className="mm-callout__content">
          <p className="mm-callout__title">{title}</p>
          {body.map((text) => (
            <p key={text}>{text}</p>
          ))}
        </div>
      </div>

      {error?.code === "missing-columns" && <ColumnCheck t={t} fileName={fileName} missing={error.missing} />}

      <section className="mm-card gap-3" aria-labelledby="fix">
        <h2 className="mm-t-h2" id="fix">
          {u.fixTitle}
        </h2>
        <ol className="flex list-decimal flex-col gap-2 pl-5">
          {[...fix, u.fixUpload].map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        {!unusable && (
          <p className="mm-t-small">
            <a className="mm-link" href={TEMPLATE_PATH} download>
              {u.template}
            </a>
          </p>
        )}
      </section>

      <div className="mm-actions">
        <UploadButton
          label={u.again}
          className="mm-btn mm-btn--primary"
          disabled={loading !== null}
          onUpload={onUpload}
        />
        <button type="button" className="mm-btn mm-btn--secondary" disabled={loading !== null} onClick={onSample}>
          {u.sample}
        </button>
      </div>
      <LoadingStatus t={t} loading={loading} />
    </>
  );
}

/** The required columns, each marked found or missing in the file. */
function ColumnCheck({ t, fileName, missing }: { t: Messages; fileName: string; missing: RequiredColumn[] }) {
  const u = t.uploadError;
  return (
    <section className="mm-card" aria-labelledby="cols">
      <div className="mm-card__head">
        <h2 className="mm-t-h2" id="cols">
          {u.foundTitle}
        </h2>
        <span className="mm-t-small mm-muted inline-flex min-w-0 items-center gap-1.5 break-all">
          <FileIcon />
          {fileName}
        </span>
      </div>
      <p className="mm-t-small mm-muted">{u.requiredColumns}</p>
      <ul className="mm-colcheck">
        {REQUIRED_COLUMNS.map((column) => {
          const absent = missing.includes(column);
          return (
            <li key={column}>
              <StatusIcon status={absent ? "no-fit" : "fits"} className={`mm-ico ${absent ? "is-missing" : "is-ok"}`} />
              <span className="mm-colcheck__name">{column}</span>
              <span className={`mm-colcheck__meta ${absent ? "font-semibold text-(--mm-nofit)" : ""}`}>
                {absent ? u.missing : u.found}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
