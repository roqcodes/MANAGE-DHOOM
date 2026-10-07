export const OUTBOX_SAVE_FEEDBACK_EVENT = "buyhub-outbox-save-feedback";

export type OutboxSaveFeedbackDetail = {
  /** Primary headline, e.g. "Saved" or "Updated". */
  message: string;
  /** Secondary line under the headline. */
  detail?: string;
  /** How long to keep the saved state visible when the queue is empty (ms). */
  durationMs?: number;
};

export function dispatchOutboxSaveFeedback(detail: OutboxSaveFeedbackDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<OutboxSaveFeedbackDetail>(OUTBOX_SAVE_FEEDBACK_EVENT, {
      detail,
    }),
  );
}
