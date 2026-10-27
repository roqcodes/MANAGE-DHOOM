"use client";

import { AlertTriangle } from "lucide-react";

import { cn } from "@/lib/utils";

export function PaymentFormInlineAlert({
  message,
  className,
}: {
  message: string | string[] | null;
  className?: string;
}) {
  if (!message) return null;

  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-2 rounded-lg border border-amber-200/90 bg-amber-50/95 px-3 py-2.5 text-sm leading-relaxed text-amber-950",
        className,
      )}
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-700" aria-hidden />
      <p>
        {Array.isArray(message) ? message.join(" ") : message}
      </p>
    </div>
  );
}
