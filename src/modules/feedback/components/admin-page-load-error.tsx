"use client";

import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ErrorsFeedbackBridge } from "@/modules/feedback/components/errors-feedback-bridge";

type AdminPageLoadErrorProps = {
  title: string;
  error: unknown;
  onRetry?: () => void;
};

export function AdminPageLoadError({ title, error, onRetry }: AdminPageLoadErrorProps) {
  return (
    <div className="mx-auto w-full max-w-7xl px-3 py-6 sm:px-4">
      <ErrorsFeedbackBridge error={error} title={title} />
      {onRetry ? (
        <Button type="button" variant="outline" size="sm" className="mt-3" onClick={onRetry}>
          <RefreshCw data-icon="inline-start" className="size-3.5" />
          Try again
        </Button>
      ) : null}
    </div>
  );
}
