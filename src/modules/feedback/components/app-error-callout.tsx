"use client";

import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ErrorsFeedbackBridge } from "@/modules/feedback/components/errors-feedback-bridge";

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
  compact: _compact,
}: AppErrorCalloutProps) {
  return (
    <>
      <ErrorsFeedbackBridge error={error} title={title} />
      {onRetry ? (
        <div className={cn("flex justify-end", className)}>
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>
            <RefreshCw data-icon="inline-start" className="size-3.5" />
            Try again
          </Button>
        </div>
      ) : null}
    </>
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
  if (!message) return null;
  return (
    <AppErrorCallout error={message} title={title} onRetry={onRetry} className={className} />
  );
}
