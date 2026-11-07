import { useRef, type ReactNode } from "react";
import type { Locale, Messages } from "@/lib/i18n";
import { formatList } from "@/lib/i18n/format";
import { REQUIRED_COLUMNS } from "@/lib/import/format-spec";
import type { Status } from "@/lib/plan/affordability";
import type { SampleProfile } from "@/lib/sample-link";
import type { Loading } from "./flow-state";
import { InfoIcon, StatusChip, UploadIcon } from "./icons";

const STATUSES: Status[] = ["fits", "tight", "no-fit"];

/**
 * What the file picker offers. Only a hint for the picker: the content
 * check decides, so a text export with another extension still works.
 */
const UPLOAD_ACCEPT = ".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain";

/**
 * A button that opens the file picker and hands over the picked file. The
 * input itself is hidden; the button is what keyboard and screen reader users reach.
 */
export function UploadButton({
  label,
  className,
  disabled,
  onUpload,
}: {
  label: string;
  className: string;
  disabled: boolean;
  onUpload: (file: File) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" className={className} disabled={disabled} onClick={() => input.current?.click()}>
        <UploadIcon />
        {label}
      </button>
      <input
        ref={input}
        type="file"
        accept={UPLOAD_ACCEPT}
        hidden
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          // Cleared, so picking the same file again (after fixing it) fires a change.
          event.currentTarget.value = "";
          if (file) {
            onUpload(file);
          }
        }}
      />
    </>
  );
}

/** The live status line while a sample loads or a file is read. */
export function LoadingStatus({ t, loading }: { t: Messages; loading: Loading | null }) {
  let text = "";
  if (loading?.kind === "sample") {
    text = t.landing.loading;
  } else if (loading?.kind === "upload") {
    text = t.landing.reading(loading.name);
  }
  return (
    <p className="mm-t-small mm-muted empty:hidden" aria-live="polite">
      {text}
    </p>
  );
}

/** The first screen: what the check does, who it's for, and the way in. */
export function Landing({
  t,
  locale,
  loading,
  loadFailed,
  uploadGone,
  onSample,
  onUpload,
}: {
  t: Messages;
  locale: Locale;
  loading: Loading | null;
  loadFailed: boolean;
  uploadGone: boolean;
  onSample: (profile: SampleProfile) => void;
  onUpload: (file: File) => void;
}) {
  const steps = t.landing.steps;
  const busy = loading !== null;
  return (
    <>
      <section className="mm-intro gap-5">
        <h1 className="mm-t-display" id="step-title" tabIndex={-1}>
          {t.landing.title}
        </h1>
        <p className="mm-t-lead mm-muted">{t.landing.lead}</p>
        <p className="mm-t-small mm-muted">{t.scope}</p>
        {uploadGone && (
          <div className="mm-callout mm-callout--info">
            <InfoIcon className="mm-ico mm-callout__icon" />
            <p className="mm-callout__content">{t.landing.uploadGone}</p>
          </div>
        )}
        <div className="mm-actions mt-2">
          <UploadButton
            label={t.landing.upload}
            className="mm-btn mm-btn--primary mm-btn--lg"
            disabled={busy}
            onUpload={onUpload}
          />
        </div>
        <div className="mm-t-small mm-muted flex flex-col gap-1">
          <p>{t.landing.uploadHint(formatList(REQUIRED_COLUMNS, locale))}</p>
          <p className="font-semibold text-(--mm-text)">{t.landing.privacy}</p>
        </div>
        <p className="mm-t-small mm-muted">
          {t.landing.sampleIntro}{" "}
          <SampleLink
            label={t.landing.sampleComfortable}
            disabled={busy}
            onClick={() => {
              onSample("comfortable");
            }}
          />{" "}
          {t.landing.sampleOr}{" "}
          <SampleLink
            label={t.landing.sampleTight}
            disabled={busy}
            onClick={() => {
              onSample("tight");
            }}
          />
          .
        </p>
        <LoadingStatus t={t} loading={loading} />
        {loadFailed && (
          <div className="mm-callout mm-callout--error" role="alert">
            <InfoIcon className="mm-ico mm-callout__icon" />
            <p className="mm-callout__content">{t.landing.loadFailed}</p>
          </div>
        )}
      </section>

      <section className="mm-card gap-5" aria-labelledby="how">
        <h2 className="mm-t-h2" id="how">
          {t.landing.howTitle}
        </h2>
        <ol className="flex list-none flex-col gap-5">
          <HowStep n={1} title={steps.dataTitle} body={steps.dataBody} />
          <HowStep n={2} title={steps.purchaseTitle} body={steps.purchaseBody} />
          <HowStep n={3} title={steps.resultTitle} body={steps.resultBody}>
            <div className="mt-1 flex flex-wrap gap-2">
              {STATUSES.map((status) => (
                <StatusChip key={status} status={status} label={t.status[status]} small />
              ))}
            </div>
          </HowStep>
        </ol>
      </section>
    </>
  );
}

/** A sample profile offered in running text, styled as a link because it's the secondary way in. */
function SampleLink({ label, disabled, onClick }: { label: string; disabled: boolean; onClick: () => void }) {
  return (
    <button type="button" className="mm-link disabled:opacity-60" disabled={disabled} onClick={onClick}>
      {label}
    </button>
  );
}

function HowStep({ n, title, body, children }: { n: number; title: string; body: string; children?: ReactNode }) {
  return (
    <li className="mm-calcstep">
      <span className="mm-calcstep__n" aria-hidden="true">
        {n}
      </span>
      <div className="mm-calcstep__c">
        <p className="mm-t-h3">{title}</p>
        <p className="mm-t-small mm-muted">{body}</p>
        {children}
      </div>
    </li>
  );
}
