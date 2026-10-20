"use client";

import { useEffect, useRef } from "react";

import { normalizeFormFooterErrors } from "@/modules/admin/lib/form-footer-errors";
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
  const { showValidationErrors, showError } = useAppFeedback();
  const prevKeyRef = useRef<string>("");

  useEffect(() => {
    const list = normalizeFormFooterErrors(errors);
    const key = listKey(list);
    if (list.length === 0) {
      prevKeyRef.current = "";
      return;
    }
    if (key === prevKeyRef.current) return;
    prevKeyRef.current = key;

    if (options?.asError && list.length === 1) {
      showError(list[0], options.title);
    } else {
      showValidationErrors(list, options?.title);
    }
  }, [errors, options?.asError, options?.title, showError, showValidationErrors]);
}

/**
 * When `error` is set, opens the global feedback modal (no inline UI).
 */
export function useUnknownErrorFeedbackModal(error: unknown, title?: string) {
  const { showError } = useAppFeedback();
  const prevKeyRef = useRef<string>("");

  useEffect(() => {
    if (error == null || error === "") {
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
    showError(error, title);
  }, [error, title, showError]);
}
