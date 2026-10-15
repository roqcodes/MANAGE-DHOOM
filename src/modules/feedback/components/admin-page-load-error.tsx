"use client";

import { AppErrorCallout } from "@/modules/feedback/components/app-error-callout";

type AdminPageLoadErrorProps = {
  title: string;
  error: unknown;
  onRetry?: () => void;
};

export function AdminPageLoadError({ title, error, onRetry }: AdminPageLoadErrorProps) {
  return (
    <div className="mx-auto w-full max-w-7xl px-3 py-6 sm:px-4">
      <AppErrorCallout error={error} title={title} onRetry={onRetry} />
    </div>
  );
}
