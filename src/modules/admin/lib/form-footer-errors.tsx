"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { ErrorsFeedbackBridge } from "@/modules/feedback/components/errors-feedback-bridge";

export function normalizeFormFooterErrors(
  errors?: string | string[] | null,
): string[] {
  if (!errors) return [];
  const list = Array.isArray(errors) ? errors : [errors];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of list) {
    const message = item.trim();
    if (!message || seen.has(message)) continue;
    seen.add(message);
    out.push(message);
  }
  return out;
}

/** @deprecated Inline footer errors — use modal via ModalFormFooter / ErrorsFeedbackBridge. */
export function FormFooterErrors({
  errors,
  className,
}: {
  errors?: string | string[] | null;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 flex-1 text-left", className)}>
      <ErrorsFeedbackBridge errors={errors} />
    </div>
  );
}

/** Errors left, action buttons right — for modal / form footers. */
export function ModalFormFooter({
  errors,
  children,
  className,
}: {
  errors?: string | string[] | null;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex w-full flex-wrap items-center justify-end gap-2",
        className,
      )}
    >
      <ErrorsFeedbackBridge errors={errors} />
      {children}
    </div>
  );
}
