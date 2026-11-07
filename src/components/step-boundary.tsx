"use client";

import { catchError } from "next/error";
import type { Messages } from "@/lib/i18n";
import { Unexpected } from "./summary";

/** The step's place, when one of its components throws while rendering. */
function StepFallback({ t }: { t: Messages }) {
  return <Unexpected t={t} />;
}

/**
 * Wraps the current step, so an error thrown while it renders (a bug: the
 * known amount overflow is handled as a value, see `guardRange`) shows the
 * "Something went wrong" callout instead of a blank page. The header is
 * outside it, so "Start over" still works. Give it a `key` that changes
 * with the step and the data, so a new step renders afresh.
 */
export const StepBoundary = catchError(StepFallback);
