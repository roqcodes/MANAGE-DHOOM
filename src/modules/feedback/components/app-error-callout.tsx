"use client";

import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { presentAppError } from "@/modules/feedback/lib/present-app-error";
import { AUDIENCE_CALLOUT } from "@/modules/feedback/lib/feedback-styles";

type AppErrorCalloutProps = {
  error: unknown;
  title?: string;
  onRetry?: () => void;
  className?: string;
  compact?: boolean;
};

export function AppErrorCallout({
  error,
  title,
  onRetry,
  className,
  compact,
}: AppErrorCalloutProps) {
  const p = presentAppError(error, { title });
  const styles = AUDIENCE_CALLOUT[p.audience];

  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-3 rounded-xl border p-4 sm:p-5",
        styles.border,
        styles.bg,
        className,
      )}
    >
      <styles.Icon className={cn("size-5 shrink-0", styles.icon)} aria-hidden />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className={cn("text-sm font-semibold", styles.title)}>{p.title}</p>
          {p.showContactDeveloper ? (
            <span className="rounded-full border border-amber-300/80 bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-900">
              Contact developer
            </span>
          ) : null}
        </div>
        <p className={cn("text-sm leading-relaxed", styles.body)}>{p.message}</p>
        {!compact && p.troubleshoot.length > 0 ? (
          <ul className={cn("list-disc space-y-0.5 pl-4 text-xs", styles.body)}>
            {p.troubleshoot.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : null}
        {onRetry ? (
          <Button type="button" variant="outline" size="sm" className="mt-1" onClick={onRetry}>
            <RefreshCw data-icon="inline-start" className="size-3.5" />
            Try again
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/** For string errors from report fetchers. */
export function AppErrorCalloutMessage({
  message,
  title = "Couldn't load report",
  onRetry,
  className,
}: {
  message: string;
  title?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <AppErrorCallout error={message} title={title} onRetry={onRetry} className={className} />
  );
}
