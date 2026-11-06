import type { ReactNode } from "react";
import type { Messages } from "@/lib/i18n";
import type { Status } from "@/lib/plan/affordability";
import type { SampleProfile } from "@/lib/sample-link";
import { ArrowRightIcon, InfoIcon, StatusChip } from "./icons";

const STATUSES: Status[] = ["fits", "tight", "no-fit"];

/** The first screen: what the check does, who it's for, and the way in. */
export function Landing({
  t,
  loading,
  loadFailed,
  onSample,
}: {
  t: Messages;
  loading: SampleProfile | null;
  loadFailed: boolean;
  onSample: (profile: SampleProfile) => void;
}) {
  const steps = t.landing.steps;
  return (
    <>
      <section className="mm-intro gap-5">
        <h1 className="mm-t-display" id="step-title" tabIndex={-1}>
          {t.landing.title}
        </h1>
        <p className="mm-t-lead mm-muted">{t.landing.lead}</p>
        <p className="mm-t-small mm-muted">{t.scope}</p>
        <div className="mm-actions mt-2">
          <button
            type="button"
            className="mm-btn mm-btn--primary mm-btn--lg"
            disabled={loading !== null}
            onClick={() => {
              onSample("comfortable");
            }}
          >
            {t.landing.trySample}
            <ArrowRightIcon />
          </button>
          <button
            type="button"
            className="mm-btn mm-btn--secondary mm-btn--lg"
            disabled={loading !== null}
            onClick={() => {
              onSample("tight");
            }}
          >
            {t.landing.tryTight}
          </button>
        </div>
        <p className="mm-t-small mm-muted" aria-live="polite">
          {loading === null ? t.landing.sampleNote : t.landing.loading}
        </p>
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
