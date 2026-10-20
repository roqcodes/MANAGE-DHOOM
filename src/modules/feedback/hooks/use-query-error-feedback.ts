"use client";

import { useEffect, useRef } from "react";

import { useAppFeedback } from "@/modules/feedback/components/app-feedback-provider";

/** Opens the feedback modal when a React Query (or similar) request fails. */
export function useQueryErrorFeedback(
  isError: boolean,
  error: unknown,
  title: string,
) {
  const { showError } = useAppFeedback();
  const shownForAttempt = useRef(false);

  useEffect(() => {
    if (!isError) {
      shownForAttempt.current = false;
      return;
    }
    if (shownForAttempt.current) return;
    shownForAttempt.current = true;
    showError(error, title);
  }, [isError, error, title, showError]);
}
