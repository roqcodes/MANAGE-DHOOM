"use client";

import { useCallback, useTransition } from "react";

/**
 * Wraps useTransition for form submits. Pair with admin-api-client calls — the top
 * progress bar is driven automatically by adminGet/adminPost/etc.
 */
export function useAdminFormSubmit() {
  const [isPending, startTransition] = useTransition();

  const run = useCallback((action: () => void | Promise<void>) => {
    startTransition(() => {
      void action();
    });
  }, []);

  return { isPending, run };
}
