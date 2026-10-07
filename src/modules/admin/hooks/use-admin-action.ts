"use client";

import { useTransition } from "react";

import { useAdminAlert } from "@/modules/admin/components/admin-alert-provider";

type RunActionOptions = {
  successMessage?: string;
  errorTitle?: string;
};

/**
 * Wraps async server actions with loading state and the global admin alert dialog.
 */
export function useAdminAction() {
  const { showError, showSuccess } = useAdminAlert();
  const [isPending, startTransition] = useTransition();

  function runAction(task: () => Promise<void>, options?: RunActionOptions) {
    startTransition(async () => {
      try {
        await task();
        if (options?.successMessage) {
          showSuccess(options.successMessage);
        }
      } catch (err) {
        showError(err, options?.errorTitle);
      }
    });
  }

  return { runAction, isPending, showError, showSuccess };
}
