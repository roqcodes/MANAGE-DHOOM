"use client";

import { useCallback, useState } from "react";

import { useAppFeedback } from "@/modules/feedback/components/app-feedback-provider";

/**
 * ERP payment forms: in modal mode, show validation on the form (no second dialog).
 * On full page, use the global feedback modal.
 */
export function useErpPaymentFormErrors(isModal: boolean) {
  const { showValidationErrors } = useAppFeedback();
  const [inlineError, setInlineError] = useState<string | null>(null);

  const clearFormError = useCallback(() => {
    setInlineError(null);
  }, []);

  const setFormError = useCallback(
    (message: string | null) => {
      if (!message) {
        setInlineError(null);
        return;
      }
      if (isModal) {
        setInlineError(message);
        return;
      }
      showValidationErrors([message], "Check the form");
    },
    [isModal, showValidationErrors],
  );

  const notifyAmountIssue = useCallback(
    (message: string, title = "Check the amount") => {
      if (isModal) {
        setInlineError(message);
        return;
      }
      showValidationErrors([message], title);
    },
    [isModal, showValidationErrors],
  );

  return { inlineError, setFormError, notifyAmountIssue, clearFormError };
}
