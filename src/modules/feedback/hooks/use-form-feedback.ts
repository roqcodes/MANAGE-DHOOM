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
  const { showError, showValidationErrors, dismissFormValidation, dismissFormSaveError } =
    useAppFeedback();

  const validationErrors = useCallback(
    (errors: string | string[] | null | undefined, title?: string) => {
      const list = normalizeFormFooterErrors(errors);
      if (list.length === 0) {
        dismissFormValidation();
        return;
      }
      showValidationErrors(list, title ?? options?.validationTitle);
    },
    [dismissFormValidation, options?.validationTitle, showValidationErrors],
  );

  const submitError = useCallback(
    (error: unknown, title?: string) => {
      if (error == null || error === "") {
        dismissFormSaveError();
        return;
      }
      showError(error, title ?? options?.submitErrorTitle, { formSaveContext: true });
    },
    [dismissFormSaveError, options?.submitErrorTitle, showError],
  );

  return { validationErrors, submitError };
}
