"use client";

import { useCallback } from "react";

import type { ConfirmOptions } from "@/modules/feedback/components/app-feedback-provider";
import { useAppFeedback } from "@/modules/feedback/components/app-feedback-provider";

/**
 * Returns a stable `confirmAction` helper for delete/destructive flows.
 */
export function useConfirmAction() {
  const { confirm } = useAppFeedback();

  const confirmAction = useCallback(
    (options: ConfirmOptions) => confirm(options),
    [confirm],
  );

  return confirmAction;
}
