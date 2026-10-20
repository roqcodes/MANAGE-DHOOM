"use client";

import {
  useErrorsFeedbackModal,
  useUnknownErrorFeedbackModal,
} from "@/modules/feedback/hooks/use-errors-feedback-modal";

type ErrorsFeedbackBridgeProps = {
  /** String or list of user-facing messages (validation or save errors). */
  errors?: string | string[] | null;
  /** Unknown error (API, thrown values). Takes precedence over `errors`. */
  error?: unknown;
  title?: string;
  asError?: boolean;
};

/** Renders nothing; syncs errors into the app feedback modal. */
export function ErrorsFeedbackBridge({
  errors,
  error,
  title,
  asError,
}: ErrorsFeedbackBridgeProps) {
  const unknown =
    error !== undefined && error !== null && error !== "" ? error : null;
  useErrorsFeedbackModal(unknown ? null : errors, { title, asError });
  useUnknownErrorFeedbackModal(unknown, title);
  return null;
}
