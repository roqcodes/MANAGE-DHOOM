"use client";

import { useEffect, useRef } from "react";

import { normalizeFormFooterErrors } from "@/modules/admin/lib/form-footer-errors";
import { validationFeedbackTitle } from "@/modules/admin/lib/form-validation";
import { useAppFeedback } from "@/modules/feedback/components/app-feedback-provider";

type ErrorsFeedbackOptions = {
  title?: string;
  /** Use for API / unexpected failures (single message). */
  asError?: boolean;
};

function listKey(lines: string[]): string {
  return lines.join("\u0000");
}

/**
 * When `errors` becomes non-empty, opens the global feedback modal (no inline UI).
 */
export function useErrorsFeedbackModal(
  errors?: string | string[] | null,
  options?: ErrorsFeedbackOptions,
) {
  const { showValidationErrors, showError, dismissFormValidation, dismissFormSaveError } =
    useAppFeedback();
  const prevKeyRef = useRef<string>("");

  useEffect(() => {
    const list = normalizeFormFooterErrors(errors);
    const key = listKey(list);
    if (list.length === 0) {
      if (prevKeyRef.current) {
        dismissFormValidation();
        dismissFormSaveError();
      }
      prevKeyRef.current = "";
      return;
    }
    if (key === prevKeyRef.current) return;
    prevKeyRef.current = key;

    if (options?.asError && list.length === 1) {
      showError(list[0], options.title, { formSaveContext: true });
    } else {
      showValidationErrors(
        list,
        options?.title ?? validationFeedbackTitle(list.length),
      );
    }
  }, [
    errors,
    options?.asError,
    options?.title,
    dismissFormSaveError,
    dismissFormValidation,
    showError,
    showValidationErrors,
  ]);

  useEffect(() => {
    return () => {
      if (prevKeyRef.current) {
        dismissFormValidation();
        dismissFormSaveError();
      }
    };
  }, [dismissFormSaveError, dismissFormValidation]);
}

/**
 * When `error` is set, opens the global feedback modal (no inline UI).
 */
export function useUnknownErrorFeedbackModal(error: unknown, title?: string) {
  const { showError, dismissFormSaveError } = useAppFeedback();
  const prevKeyRef = useRef<string>("");

  useEffect(() => {
    if (error == null || error === "") {
      if (prevKeyRef.current) {
        dismissFormSaveError();
      }
      prevKeyRef.current = "";
      return;
    }
    const key =
      typeof error === "string"
        ? error
        : error instanceof Error
          ? `${error.name}:${error.message}`
          : String(error);
    if (key === prevKeyRef.current) return;
    prevKeyRef.current = key;
    showError(error, title, { formSaveContext: true });
  }, [error, title, dismissFormSaveError, showError]);

  useEffect(() => {
    return () => {
      if (prevKeyRef.current) {
        dismissFormSaveError();
      }
    };
  }, [dismissFormSaveError]);
}
