"use client";

import { useCallback } from "react";

import { normalizeFormFooterErrors } from "@/modules/admin/lib/form-footer-errors";
import { useAppFeedback } from "@/modules/feedback/components/app-feedback-provider";

type FormFeedbackOptions = {
  validationTitle?: string;
  submitErrorTitle?: string;
};

/**
 * Standard form handlers: validation and API errors open the global feedback modal.
 */
export function useFormFeedback(options?: FormFeedbackOptions) {
  const { showError, showValidationErrors } = useAppFeedback();

  const validationErrors = useCallback(
    (errors: string | string[] | null | undefined, title?: string) => {
      const list = normalizeFormFooterErrors(errors);
      if (list.length === 0) return;
      showValidationErrors(list, title ?? options?.validationTitle);
    },
    [options?.validationTitle, showValidationErrors],
  );

  const submitError = useCallback(
    (error: unknown, title?: string) => {
      showError(error, title ?? options?.submitErrorTitle);
    },
    [options?.submitErrorTitle, showError],
  );

  return { validationErrors, submitError };
}
