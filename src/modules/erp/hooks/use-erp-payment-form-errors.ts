"use client";

import { useCallback, useState } from "react";

/**
 * ERP payment forms: always use inline alert on the form (modal + page).
 * Avoids global validation modals that re-open on focus/blur after dismiss.
 */
export function useErpPaymentFormErrors(_isModal: boolean) {
  const [inlineError, setInlineError] = useState<string | string[] | null>(null);

  const clearFormError = useCallback(() => {
    setInlineError(null);
  }, []);

  const setFormError = useCallback((message: string | string[] | null) => {
    setInlineError(message);
  }, []);

  const notifyAmountIssue = useCallback((message: string) => {
    setInlineError(message);
  }, []);

  return { inlineError, setFormError, notifyAmountIssue, clearFormError };
}
